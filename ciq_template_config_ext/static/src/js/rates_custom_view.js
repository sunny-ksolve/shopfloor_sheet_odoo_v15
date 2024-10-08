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
            'click .o_new_sheet_create_button': 'openNewSheetWizard',
            'change .cell': 'createRecord',
            'click .delete-button': 'deleteSheet',
            'click .edit-button': 'editSheet',
            'dblclick .hello': 'editSheet',
            'click .hello': 'onSheetClick',
            'click .o_add_a_line_button': 'onAddALineClicked',
            'click .o_cancle_button': 'onCancleClicked',
        },
        custom_events: _.extend({}, AbstractAction.prototype.custom_events, {
//            pager_changed: '_onPagerChanged',
        }),

        init: function(parent, action) {
            this._super.apply(this, arguments);
            this.actionManager = parent;
            this.action = action;
            this.context = action.context;
            this.domain = [];
            this.companyId = false;
            this.currentPricelist = false
            this.pricelist = []
            this.state = false;
            this.active_ids = [];
            this.pager = false;
            this.pager_ids = false;
            this.onSearch = false;
            this.currentWeekSlot = false;
            this.intialPricelistName = false;
            this.sheetName = '';
            this.selectedSheet = false;
            this.table = [];
            this.onClickAddALine = false;
            this.mutex = new concurrency.Mutex();
            this.searchModelConfig.modelName = 'shop.floor.table';
            this.currentMinimum = 0;
            this.limit = 0;
        },

        willStart: async function() {
            var self = this;
            var _super = this._super.bind(this);
            var args = arguments;

            var def_control_panel = await this._rpc({
                model: 'ir.model.data',
                method: 'check_object_reference',
                args: ['ciq_template_config_ext', 'hotel_rate_search_view'],
                kwargs: {
                    context: session.user_context
                },
            })
            self.viewId = def_control_panel[1];

            var def_active_ids = await self._getActiveIds();

            return self._getState().then(function() {
                    if (self.pricelist && self.pricelist.length) {
                        self.currentPricelist = self.pricelist[0]["id"];
                        self.intialPricelistName = self.pricelist[0]["name"];
                    }
                    return _super.apply(self, args);
            });
        },

        start: async function() {
            await this._super(...arguments);
            if (this.pager_ids.length == 0) {
                this.$el.find('.o_rate_manager').append($(QWeb.render('rate_manager_nocontent_helper')));
            }
            await this.update_cp();
//            await this.renderPager();
        },

        update_cp: function() {
            var self = this;
            this.$buttons = $(QWeb.render('rates_manager_control_panel_buttons', {
                widget: {
                    pricelist: self.pricelist
                }
            }));

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

            var $open_rooms = this.$buttons.find(".o_select_open_rooms");
            $open_rooms.on('click', self.openRooms.bind(self));

            return this.updateControlPanel({
                title: _t('Shop Floor'),
                cp_content: {
                    $buttons: this.$buttons,
                },
            });
        },

       _getState: function() {
            var self = this;
            var domain = this.domain;
            var pager_domain = [['id', 'in', this.active_ids]];

            return this._rpc({
                model: 'shop.floor.table',
                method: 'get_rate_view_state',
                args: [self.currentPricelist, domain, pager_domain, this.onSearch],
            }).then(function(state) {
                self.companyId = state.company_id;
                self.productsSidebar = state.products_sidebar;
                self.pricelist = state.pricelist;
                self.pager_ids = state.pager;
                self.active_ids = state.pager.slice(0, defaultPagerSize).map(i=>i.id);
                if (!self.pager_ids || self.onSearch) {
                    self.pager_ids = state.pager;
                    if (self.onSearch) {
                        self.onSearch = false;
                    }
                }
                return state;
            });
},

//        renderPager: async function() {
//            const currentMinimum = 1;
//            const limit = defaultPagerSize;
//            const size = this.pager_ids.length;
//
//            this.pager = new ComponentWrapper(this,Pager,{
//                currentMinimum,
//                limit,
//                size
//            });
//
//            await this.pager.mount(document.createDocumentFragment());
//            const pagerContainer = Object.assign(document.createElement('span'), {
//                className: 'o_rate_view_manager_pager float-right',
//            });
//            pagerContainer.appendChild(this.pager.el);
//            this.$pager = pagerContainer;
//
//            this._controlPanelWrapper.el.querySelector('.o_cp_pager').append(pagerContainer);
//        },

        onAddALineClicked:async function(ev){
            if(this.onClickAddALine){
                ev.stopPropagation();

                var self = this;
                var columnValue = this.$el.find('.form-control').val()
                if(!columnValue || columnValue.trim() === ""){
                    this.displayNotification({ title: _t("Input Field can't be Empty."), type: 'danger', message: _t("Please enter column name.") });
                    return
                }
                var type_of_fields = this.$el.find('#sqlDataTypes').val()
                var mandatory = this.$el.find('#mandatory').val()
                var sheet_id = this.selectedSheet
                try{
                    let newTableId = await this._rpc({
                        model: 'shop.floor.table',
                        method: 'create',
                        args: [{
                            column:columnValue,
                            type_of_fields: type_of_fields,
                            mandatory: mandatory,
                            sheet_id: sheet_id,
                        }],
                    })
                    this.onClickAddALine = false
                    this.table = [...this.table,{'id': newTableId, 'column': columnValue, 'type_of_fields': type_of_fields, 'mandatory': mandatory}]
                }catch(e){
                    this.displayNotification({ title: _t("Error."), type: 'danger', message: e });
                }
            }else{
                this.onClickAddALine = true
            }
            this._reloadContent()
        },
        onCancleClicked:function(){
            this.onClickAddALine = false
            this._reloadContent()
        },

        onSheetClick:async function(ev){
            const id = Number(ev.currentTarget.dataset["id"])
            const name = ev.currentTarget.dataset["name"]
            this.sheetName = name
            try{
                this.table = await this._rpc({
                    model: 'shop.floor.sheet',
                    method: 'get_table_inside_a_sheet',
                    args: [id],
                })
                this.selectedSheet = id
                this._reloadContent()
            }catch(error){
                console.log(error)
            }
        },




        deleteSheet: function(ev) {
            ev.stopPropagation();
            var self = this
            var id = $(ev.currentTarget).data('id');
            Dialog.confirm(self, _t("Are you sure you want to delete this record?"), {
                confirm_callback: ()=> {
                    this._rpc({
                        model: 'shop.floor.sheet',
                        method: 'unlink',
                        args: [id],
                    })
                    var self = this;
//                    this.$pager.remove();
//                    this.pager.destroy();
                    this._reloadContent()
                },
            });
        },

        editSheet: function(ev) {
            ev.stopPropagation();
            var self = this
            var id = $(ev.currentTarget).data('id');
            var oldSheetName = $(ev.currentTarget).data('name');
            var $content = $('<div>').append($('<input>', {type: 'text', class: 'o_set_qty_input'}).val(oldSheetName));
            this.dialog = new Dialog(this, {
            title: _t('Set New Sheet Name'),
            buttons: [{text: _t('Update'), classes: 'btn-primary', close: true, click: function () {
                var newSheetName = this.$content.find('.o_set_qty_input').val();
                return this._rpc({
                        model: 'shop.floor.sheet',
                        method: 'write',
                        args: [id, {
                            'sheet_name': newSheetName,
                        }],
                    }).then(function(){
//                        self.$pager.remove();
//                        self.pager.destroy();
                        self._reloadContent()
                    })
            }},
            {text: _t('Discard'), close: true}],
            $content: $content,
            });
            this.dialog.open();
        },



//        _onPagerChanged: function(ev) {
//            let {currentMinimum, limit} = ev.data;
//            this.pager.update({
//                currentMinimum,
//                limit
//            });
//            this.currentMinimum = currentMinimum;
//            this.limit = limit;
//            currentMinimum = currentMinimum - 1;
//            this.active_ids = this.pager_ids.slice(currentMinimum, currentMinimum + limit).map(i=>i.id);
//            this._reloadContent();
//        },




        _reloadContent: function(days=14) {
            var self = this;

            return self._getState(days).then(function() {
                if (self.pager_ids.length == 0) {
                    self.$el.find('.o_rate_manager').replaceWith($(QWeb.render('rate_manager_nocontent_helper')));
                } else {
                    var $content = $(QWeb.render('rate_manager', {
                        widget: {
                            'widget': self,
                            'productsSidebar': self.productsSidebar,
                            'currentPricelist': self.currentPricelist,
                            'selectedSheet':self.selectedSheet,
                        }
                    }));
                    $('.o_rate_manager').replaceWith($content);
//                    if (!$(self.$pager).find(".o_pager").length) {
//                        self.$pager.remove();
//                        self.pager.destroy();
//                        self.renderPager();
//                        self._onPagerChanged({
//                            'data': {
//                                'currentMinimum': self.currentMinimum,
//                                'limit': self.limit
//                            }
//                        })
//                    }
                }

            });
        },


        _onClickDropDown: function(ev) {
            $(ev.currentTarget).parent().toggleClass('open');
        },

        _onClickDropDownList: function(ev) {
            $('.dropdown > .list > .item').removeClass('selected');
            $(ev.currentTarget).addClass('selected').parent().parent().removeClass('open').children('.caption').text($(ev.currentTarget).text());
            this.currentPricelist = $(ev.currentTarget).data('id');
            var self = this;
//            this.$pager.remove();
//            this.pager.destroy();
            this._reloadContent()
        },


        openNewSheetWizard: async function(ev){
            ev.preventDefault();
            var fullContext = _.extend({}, this.context, {
                'default_template_id': this.currentPricelist
            });

            this.do_action('ciq_template_config_ext.shop_floor_create_new_sheet_wizard',{
                additional_context: fullContext,
                on_close: this._reloadContent.bind(this)
            });
        },


        sadcreateRecord: function(ev) {
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
//            this.$pager.remove();
//            this.pager.destroy();
            this.onSearch = true;
            if (!this.domain.length) {
                self._getActiveIds().then(function() {
                    self.onSearch = false;
//                    self._reloadContent().then(function() {
//                        self.renderPager();
//                    });
                    self._reloadContent()
                })
            } else {
                self._reloadContent()
            }
        },


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


        _getActiveIds: function(days=14) {
            var self = this;
            var domain = this.domain;
            var pager_domain = [['id', 'in', this.active_ids]];
            return this._rpc({
                model: 'shop.floor.table',
                method: 'get_active_ids',
                args: [self.currentPricelist, domain],
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
