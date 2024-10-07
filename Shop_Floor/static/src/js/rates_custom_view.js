odoo.define('hotel.RatesClientAction', function(require) {
    'use strict';

    const {ComponentWrapper} = require('web.OwlCompatibility');

    var concurrency = require('web.concurrency');
    var core = require('web.core');
    var Pager = require('web.Pager');
    var AbstractAction = require('web.AbstractAction');
    var Dialog = require('web.Dialog');
    var field_utils = require('web.field_utils');
    var session = require('web.session');
    var time = require('web.time');

    var QWeb = core.qweb;
    var _t = core._t;

    const defaultPagerSize = 20;

    var RatesClientAction = AbstractAction.extend({

        contentTemplate: 'rate_manager',
        hasControlPanel: true,
        loadControlPanel: true,
        withSearchBar: true,
        events: {
            'click .o_rate_view_export_excel': 'printReportXlsx',
            'change .cell': 'createRecord',
            'click .o_rate_view_button_prev': '_onPrevPeriodClicked',
            'click .o_rate_view_button_next': '_onNextPeriodClicked',
            'click .o_rate_view_button_today': '_onTodayClicked',
        },
        custom_events: _.extend({}, AbstractAction.prototype.custom_events, {
            pager_changed: '_onPagerChanged',
        }),

        init: function(parent, action) {
            this._super.apply(this, arguments);
            this.actionManager = parent;
            this.action = action;
            this.context = action.context;
            this.domain = [];
            this.companyId = false;
            this.currentPricelist = false
            this.state = false;
            this.active_ids = [];
            this.pager = false;
            this.pager_ids = false;
            this.onSearch = false;
            this.currentWeekSlot = false;
            this.intialPricelistName = false;
            this.mutex = new concurrency.Mutex();
            this.searchModelConfig.modelName = 'hotel.rates';
            this.today_date_next = false;
            this.today_date_previous = false;
            this.is_today_clicked = true;
            this.ratePeriods = this.getDateSlotes();
            this.currentMinimum = 0;
            this.limit = 0;
        },

        willStart: function() {
            var self = this;
            var _super = this._super.bind(this);
            var args = arguments;

            var def_control_panel = this._rpc({
                model: 'ir.model.data',
                method: 'get_object_reference',
                args: ['hotel', 'hotel_rate_search_view'],
                kwargs: {
                    context: session.user_context
                },
            }).then(function(viewId) {
                self.viewId = viewId[1];
            });

            var def_active_ids = this._getActiveIds();
            return Promise.all([def_control_panel, def_active_ids]).then(function() {
                return self._getState().then(function() {
                    if (self.pricelist && self.pricelist.length) {
                        self.currentPricelist = self.pricelist[0]["id"];
                        self.intialPricelistName = self.pricelist[0]["name"];
                    }
                    return _super.apply(self, args);
                });
            });
        },

        start: async function() {
            await this._super(...arguments);
            if (this.pager_ids.length == 0) {
                this.$el.find('.o_rate_manager').append($(QWeb.render('rate_manager_nocontent_helper')));
            }
            await this.update_cp();
            await this.renderPager();
        },

        renderPager: async function() {
            const currentMinimum = 1;
            const limit = defaultPagerSize;
            const size = this.pager_ids.length;

            this.pager = new ComponentWrapper(this,Pager,{
                currentMinimum,
                limit,
                size
            });

            await this.pager.mount(document.createDocumentFragment());
            const pagerContainer = Object.assign(document.createElement('span'), {
                className: 'o_rate_view_manager_pager float-right',
            });
            pagerContainer.appendChild(this.pager.el);
            this.$pager = pagerContainer;

            this._controlPanelWrapper.el.querySelector('.o_cp_pager').append(pagerContainer);
        },

        _onPagerChanged: function(ev) {
            let {currentMinimum, limit} = ev.data;
            this.pager.update({
                currentMinimum,
                limit
            });
            this.currentMinimum = currentMinimum;
            this.limit = limit;
            currentMinimum = currentMinimum - 1;
            this.active_ids = this.pager_ids.slice(currentMinimum, currentMinimum + limit).map(i=>i.id);
            this._reloadContent();
        },

        update_cp: function() {
            var self = this;
            this.$buttons = $(QWeb.render('rates_manager_control_panel_buttons', {
                widget: {
                    pricelist: self.pricelist
                }
            }));
            var $o_week = this.$buttons.find('.o_week');
            $o_week.on('click', self._onClickWeek.bind(self));

            var $dropdown_caption = this.$buttons.find('.dropdown > .caption');
            $dropdown_caption.on('click', self._onClickDropDown.bind(self));

            if (self.intialPricelistName)
                $dropdown_caption.text(self.intialPricelistName);

            var $dropdown_list = this.$buttons.find('.dropdown >  .list > .item');
            $dropdown_list.on('click', self._onClickDropDownList.bind(self));

            if (self.currentPricelist) {
                var elem = _.filter($dropdown_list, (elem)=>{
                    return $(elem).data('id') == self.currentPricelist;
                }
                )

                if (elem.length)
                    $(elem).addClass('selected');
            }

            var $update_rates = this.$buttons.find(".o_select_update_rates");
            $update_rates.on('click', self.updateBulkPrice.bind(self));

            var $close_rooms = this.$buttons.find(".o_select_close_rooms");
            $close_rooms.on('click', self.closeRooms.bind(self));

            var $open_rooms = this.$buttons.find(".o_select_open_rooms");
            $open_rooms.on('click', self.openRooms.bind(self));

            return this.updateControlPanel({
                title: _t('Rate Manager'),
                cp_content: {
                    $buttons: this.$buttons,
                },
            });
        },

        _getState: function(days=14) {
            var self = this;
            var domain = this.domain;
            var pager_domain = [['id', 'in', this.active_ids]];
            var startDate = this.startDate.format("YYYY-MM-DD");
            var endDate = this.endDate.format("YYYY-MM-DD");
            //            Fetched Custom slots for getting kpi information
            self.custom_slots = self.getDateSlotes().map((slot)=>{
                let slot_clone = slot.clone();
                return {
                    'start': slot_clone.format('YYYY-MM-DD HH:mm:ss'),
                    'start_date': slot_clone.format('YYYY-MM-DD'),
                    'stop': slot_clone.add('1', 'day').format('YYYY-MM-DD HH:mm:ss')
                }
            }
            );
            return this._rpc({
                model: 'hotel.rates',
                method: 'get_rate_view_state',
                args: [days, startDate, endDate, self.currentPricelist, domain, pager_domain, this.onSearch, self.custom_slots],
            }).then(function(state) {
                self.companyId = state.company_id;
                self.productsSidebar = state.products_sidebar;
                self.pricelist = state.pricelist;
                if (!self.pager_ids || self.onSearch) {
                    self.pager_ids = state.pager;
                    if (self.onSearch) {
                        self.onSearch = false;
                    }
                }
                self.all_kpi_info = state.kpi_info
                return state;
            });
        },

        convertToServerTime: function(date) {
            var result = date.clone();
            if (!result.isUTC()) {
                result.subtract(session.getTZOffset(date), 'minutes');
            }
            return result.locale('en').format('YYYY-MM-DD');
        },

        _convertToUserTime: function(date) {
            // we need to change the original timezone (UTC) to take the user
            // timezone
            return date.clone().local();
        },

        getDateSlotes: function(days=14) {

            // not changing the start date in case of next button
            if (!this.today_date_next && !this.today_date_previous && this.is_today_clicked) {
                this.startDate = moment().clone().startOf('week');
            }
            //            else {
            //                this.today_date_next = false;
            //                this.today_date_previous = false;
            //            }

            var days_arr = [];
            for (var i = 0; i < days; i++) {
                days_arr.push(moment(this.startDate).add(i, 'days'));
            }
            this.endDate = days_arr[days_arr.length - 1];
            return days_arr;
        },

        _reloadContent: function(days=14) {
            var self = this;

            if (this.currentWeekSlot)
                days = this.currentWeekSlot;
            return self._getState(days).then(function() {
                if (self.pager_ids.length == 0) {
                    self.$el.find('.o_rate_manager').replaceWith($(QWeb.render('rate_manager_nocontent_helper')));
                } else {
                    var $content = $(QWeb.render('rate_manager', {
                        widget: {
                            'widget': self,
                            'ratePeriods': self.getDateSlotes(days),
                            'productsSidebar': self.productsSidebar,
                            'currentPricelist': self.currentPricelist,
                            'all_kpi_info': self.all_kpi_info,
                        }
                    }));
                    $('.o_rate_manager').replaceWith($content);
                    self.$el.find(".cell").on("change", self.createRecord.bind(self));
                    if (!$(self.$pager).find(".o_pager").length) {
                        self.$pager.remove();
                        self.pager.destroy();
                        self.renderPager();
                        self._onPagerChanged({
                            'data': {
                                'currentMinimum': self.currentMinimum,
                                'limit': self.limit
                            }
                        })
                    }
                }

            });
        },

        _onClickWeek: function(ev) {
            ev.stopPropagation();
            var days = Number(ev.currentTarget.dataset["days"]);
            this.getDateSlotes(days);
            this.currentWeekSlot = days;
            this._reloadContent(days);
        },

        _onClickDropDown: function(ev) {
            $(ev.currentTarget).parent().toggleClass('open');
        },

        _onClickDropDownList: function(ev) {
            $('.dropdown > .list > .item').removeClass('selected');
            $(ev.currentTarget).addClass('selected').parent().parent().removeClass('open').children('.caption').text($(ev.currentTarget).text());
            this.currentPricelist = $(ev.currentTarget).data('id');
            this._reloadContent();
        },

        createRecord: function(ev) {
            ev.stopPropagation();
            var self = this;
            var id = $(ev.currentTarget).data('hotel_rate_id');
            var value = Number($(ev.currentTarget).val()).toFixed(2);
            if (isNaN(value)) {
                self.do_notify(_t("Invalid Value"), _t('Entered Value is not a Correct Number ' + (value) + ' .'));
            } else if (value <= 0) {
                self.do_notify(_t("Invalid Value"), _t('Sales Price should be greater then zero ' + (value) + ' .'));
            } else {
                if (id) {
                  if($($(ev.currentTarget)).hasClass("input_green")){
                    return this._rpc({
                        model: 'hotel.rates',
                        method: 'write',
                        args: [id, {
                            'sales_price': value,
                        }],
                    })
                  }else{
                      self.do_notify(_t("You can not able to update price as it is already booked/closed"));
                      $(ev.currentTarget)[0].value = $(ev.currentTarget)[0].defaultValue
                  }
                } else {
                    return this._rpc({
                        model: 'hotel.rates',
                        method: 'create',
                        args: [{
                            product_id: $(ev.currentTarget).data('product_id'),
                            categ_id: $(ev.currentTarget).data('product_categ_id'),
                            pricelist_id: this.currentPricelist,
                            sales_price: value,
                            date: $(ev.currentTarget).data('date'),
                            availability: 'available'
                        }],
                    }).then(function(res) {
                        if (res) {
                            $(ev.currentTarget).addClass("input_green");
                            $(ev.currentTarget).attr('data-hotel_rate_id', res);
                        }
                    })
                }
            }
        },

        getPricelistPrice: function(child, period) {
            var res = _.filter(child.pricelist_data, (data)=>{
                return data['date'] == period.format("YYYY-MM-DD")
            }
            )
            if (Object.keys(res).length) {
                var input_class = this.getChildClass(res[0]["availability"]);
                res[0]['class'] = input_class;
                return res[0];
            }
            return {
                'sales_price': 0.00,
                'class': ''
            };
        },

        getChildClass: function(status) {

            if (status == "closed")
                return 'input_red'
            if (status == "booked")
                return 'input_yellow'
            if (status == "available")
                return 'input_green'
        },

        updateBulkPrice: function(ev) {
            ev.preventDefault();
            var fullContext = _.extend({}, this.context, {
                'model_name': 'hotel.rates'
            });
            var days = this.currentWeekSlot || 14;
            this.do_action('hotel.update_room_price_wizard_action', {
                additional_context: fullContext,
                on_close: this._reloadContent.bind(this, days)
            });
        },

        closeRooms: function(ev) {
            ev.preventDefault();
            var days = this.currentWeekSlot || 14;
            this.do_action('hotel.close_hotel_room_wizard_action', {
                on_close: this._reloadContent.bind(this, days)
            });
        },

        openRooms: function(ev) {
            ev.preventDefault();
            var days = this.currentWeekSlot || 14;
            this.do_action('hotel.open_hotel_room_wizard_action', {
                on_close: this._reloadContent.bind(this, days)
            });
        },

        _onSearch: function(searchQuery) {
            event.stopPropagation();
            var self = this;
            this.domain = searchQuery.domain;
            this.$pager.remove();
            this.pager.destroy();
            this.onSearch = true;
            if (!this.domain.length) {
                self._getActiveIds().then(function() {
                    self.onSearch = false;
                    self._reloadContent().then(function() {
                        self.renderPager();
                    });
                })
            } else {
                self._reloadContent().then(function() {
                    self.renderPager();
                });
            }
        },

        /**
         * @method to print report excel
        */
        printReportXlsx: function() {
            var self = this;
            self._reloadContent().then(function() {
                var startDate = self.startDate.format("YYYY-MM-DD");
                var endDate = self.endDate.format("YYYY-MM-DD");
                self._rpc({
                    model: 'hotel.rates',
                    method: 'print_xlsx',
                    args: ['', {
                        'productsSidebar': self.productsSidebar,
                        'startDate': startDate,
                        'endDate': endDate
                    }],
                }).then(function(action) {
                    return self.do_action(action);
                });
            });
        },

        _onPrevPeriodClicked: function(ev) {
            ev.preventDefault();
            var days = this.endDate.diff(this.startDate, 'days') + 1;
            if (days == 7 || days == 14) {
                this.today_date_next = false;
                this.is_today_clicked = false;
                this.today_date_previous = true;
                this.startDate.subtract(days, "days");
                this.getDateSlotes(days);
                this._reloadContent(days);
            }
        },

        _onNextPeriodClicked: function(ev) {
            ev.preventDefault();
            var days = this.endDate.diff(this.startDate, 'days') + 1;

            if (days == 7 || days == 14) {
                this.today_date_next = true;
                this.is_today_clicked = false;
                this.today_date_previous = false;
                this.startDate.add(days, "days");
                this.getDateSlotes(days);
                this._reloadContent(days);
            }
        },

        _onTodayClicked: function(ev) {
            ev.preventDefault();
            var days = this.endDate.diff(this.startDate, 'days') + 1;

            if (days == 7 || days == 14) {
                this.is_today_clicked = true;
                this.today_date_next = false;
                this.today_date_previous = false;
                this.startDate.add(days, "days");
                this.getDateSlotes(days);
                this._reloadContent(days);
            }
        },

        _getActiveIds: function(days=14) {
            var self = this;
            var domain = this.domain;
            var pager_domain = [['id', 'in', this.active_ids]];
            var startDate = this.startDate.format("YYYY-MM-DD");
            var endDate = this.endDate.format("YYYY-MM-DD");
            return this._rpc({
                model: 'hotel.rates',
                method: 'get_active_ids',
                args: [days, startDate, endDate, self.currentPricelist, domain],
            }).then(function(state) {
                self.pager_ids = state.pager;
                self.active_ids = state.pager.slice(0, defaultPagerSize).map(i=>i.id);
                return state;
            });
        },

    });
    core.action_registry.add('rates_view_manager_client_action', RatesClientAction);

    return RatesClientAction;

})
