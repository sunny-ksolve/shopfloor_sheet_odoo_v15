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
            'click .hello': 'onSheetClick',
            'click .o_add_a_line_button': 'onAddALineClicked',
            'click .o_cancle_button': 'onCancleClicked',
            'click .open_template': 'openTemplate',
            'click .sidebar-toggle-btn': '_onResize',
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
            this.initialPricelistName = "";
            this.companyId = false;
            this.showSidebar = true;
            this.state = false;
            this.active_ids = [];
            this.pager = false;
            this.pager_ids = false;
            this.onSearch = false;
            this.currentWeekSlot = false;
            this.firstSheet = [];
            this.currentSheetName = '';
            this.currentSheetId = '';
            this.selectedSheet = false;
            this.table = [];
            this.onClickAddALine = false;
            this.mutex = new concurrency.Mutex();
            this.searchModelConfig.modelName = 'shop.floor.table';

            this.defaultTemplateName = "";
            this.currentPricelist = false
            this.pricelist = []
        },

        willStart: async function() {
            var self = this;
            var _super = this._super.bind(this);
            this._onResize = this._onResize.bind(this);
            var args = arguments;
            this.currentPricelist = this.context.default_template_id ?? false;
            var def_control_panel = await this._rpc({
                model: 'ir.model.data',
                method: 'check_object_reference',
                args: ['ciq_template_config_ext', 'hotel_rate_search_view'],
                kwargs: {
                    context: session.user_context
                },
            })
            self.viewId = def_control_panel[1];


            return self._getState().then(async function() {
                    if(self.currentPricelist){
                        self.defaultTemplateName = self.pricelist.find(data=>data.id == self.currentPricelist).name
                    }
                    else if (self.pricelist && self.pricelist.length) {
                        self.currentPricelist = self.pricelist[0]["id"];
                        self.defaultTemplateName = self.pricelist[0]["name"];
                    }
                    if(self.pager_ids.length){
                        await self.getFirstSheetTables();
                    }
                    if(self.productsSidebar.length >= 1){
                        self.currentSheetName = self.firstSheet.name
                        self.currentSheetId = self.firstSheet.id
                    }
                    return _super.apply(self, args);
            });
        },

        getFirstSheetTables:async function(){
            const id = this.firstSheet.id
            const name = this.firstSheet.name
            try{
                this.table = await this._rpc({
                    model: 'shop.floor.sheet',
                    method: 'get_table_inside_a_sheet',
                    args: [id],
                })
                this.selectedSheet = true
            }catch(error){
                console.log(error)
            }
        },

        start: async function() {
            await this._super(...arguments);
            if (this.pricelist.length == 0) {
                let $parent_view = this.$el.find('.o_rate_manager')
                $parent_view.empty();
                $parent_view.append($(QWeb.render('rate_manager_nocontent_helper')));
            }
            await this.update_cp();
        },

       _getState:async function() {
//            var self = this;
            const domain = this.domain;
            const pager_domain = [['id', 'in', this.active_ids]];
            const currentPricelist = this.currentPricelist;

            const state = await this._rpc({
                model: 'shop.floor.table',
                method: 'get_rate_view_state',
                args: [currentPricelist, domain, pager_domain, this.onSearch],
            })
            this.productsSidebar = state.products_sidebar;
            this.pricelist = state.pricelist;
            this.pager_ids = state.pager;
            this.firstSheet = state.first_sheet
            this.active_ids = state.pager.slice(0, defaultPagerSize).map(i=>i.id);
            if (!this.pager_ids || this.onSearch) {
                this.pager_ids = state.pager;
                if (this.onSearch) {
                    this.onSearch = false;
                }
            }
       },

       update_cp: function() {
            var self = this;
            this.$buttons = $(QWeb.render('rates_manager_control_panel_buttons', {
                widget: {
                    pricelist: self.pricelist,
                    currentTemplateName: self.defaultTemplateName,
                }
            }));

            var $dropdown_caption = this.$buttons.find('.dropdown > .caption');
            $dropdown_caption.on('click', self._onClickDropDown.bind(self));

            var $redirectToTemplateButton = this.$buttons.find('.dropdown > #redirect_to_template');
            $redirectToTemplateButton.on('click', self._redirectToTemplateListView.bind(self));

//            if (self.defaultTemplateName)
//                $dropdown_caption.text(self.defaultTemplateName);

            var $dropdown_list = this.$buttons.find('.dropdown >  .list > .item');
            $dropdown_list.on('click', self._onClickDropDownList.bind(self));

            if (self.currentPricelist) {
                var elem = _.filter($dropdown_list, (elem)=>{
                    return $(elem).data('id') == self.currentPricelist;
                })

                if (elem.length)
                    $(elem).addClass('selected');
            }

            return this.updateControlPanel({
                title: _t('Shop Floor'),
                cp_content: {
                    $buttons: this.$buttons,
                },
            });
        },

        onAddALineClicked:async function(ev){
            if(this.onClickAddALine){
                ev.stopPropagation();

                var self = this;
                let $input = this.$el.find('.configuration_input')
                var columnValue = $input.val()
                if(!columnValue || columnValue.trim() === ""){
                    $input.css('border-color', 'red');
                    setTimeout(function() {
                        $input.css('border-color', ''); // Reset to default color
                    }, 4000);
                    this.displayNotification({ title: _t("Input Field can't be Empty."), type: 'danger', message: _t("Please enter column name.") });
                    return
                }
                var type_of_fields = this.$el.find('#sqlDataTypes').val()
                var mandatory = this.$el.find('#mandatory').val() == "true" ? true : false;
                var sheet_id = this.currentSheetId
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
//                    this._reloadContent()
                    await this._getState()
                    this._renderTableComponent()
                }catch(e){
                    this.displayNotification({ title: _t("Error."), type: 'danger', message: e });
                }
            }else{
                this.onClickAddALine = true
                this._renderTableComponent();
            }
        },

        _onResize:function(){
               document.getElementById('sidebar').style.transform = this.showSidebar ? 'translateX(-100%)' : 'translateX(0%)';
               this.showSidebar = !this.showSidebar;
        },

        onCancleClicked:function(){
            this.onClickAddALine = false
            this._reloadContent()
        },

        onSheetClick:async function(ev){
            const id = Number(ev.currentTarget.dataset["id"])
            const name = ev.currentTarget.dataset["name"]
            this.currentSheetName = name
            this.currentSheetId = id
            try{
                this.table = await this._rpc({
                    model: 'shop.floor.sheet',
                    method: 'get_table_inside_a_sheet',
                    args: [id],
                })
                this.selectedSheet = true
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
//                    var self = this;
//                    this.$pager.remove();
//                    this.pager.destroy();
                    this._createFirstSheet()
                },
            });
        },

        editSheet: function(ev) {
            ev.stopPropagation();
            var self = this
            var id = $(ev.currentTarget).data('id');
            var oldSheetName = $(ev.currentTarget).data('name');
            var $content = $('<div>').append($('<input>', {type: 'text',placeholder:'Nokia sheet...', class: 'configuration_input'}).val(oldSheetName));
            this.dialog = new Dialog(this, {
            title: _t('Set New Sheet Name'),
            buttons: [{text: _t('Update'), classes: 'btn-primary', click: function () {

                let $input = this.$content.find('.configuration_input')
                let newSheetName = $input.val();
                if (!newSheetName || newSheetName.trim() === "") {
                    $input.css('border-color', 'red');
                    setTimeout(function() {
                        $input.css('border-color', '');
                    }, 4000);
                    this.displayNotification({ title: _t("Input Field can't be Empty."), type: 'danger', message: _t("Please enter column name.") });
                    return
                }
                return this._rpc({
                        model: 'shop.floor.sheet',
                        method: 'write',
                        args: [id, {
                            'sheet_name': newSheetName,
                        }],
                    }).then(function(){
//                        self.$pager.remove();
//                        self.pager.destroy();
                        if(self.currentSheetId == id){
                            self.currentSheetName = newSheetName
                        }
                        self._reloadContent()
                        self.dialog.close();
                    }.bind(self))
            }},
            {text: _t('Discard'), close: true}],
            $content: $content,
            });
            this.dialog.open();
        },

        _reloadContent: function() {
            var self = this;
            return self._getState().then(function() {
                    self.defaultTemplateName = self.pricelist[0]["name"]
                    var $content = $(QWeb.render('rate_manager', {
                        widget: {
                            'widget': self,
                            'productsSidebar': self.productsSidebar,
                            'currentPricelist': self.currentPricelist,
                            'selectedSheet':self.selectedSheet,
                            'currentSheetName':self.currentSheetName,
                            'currentSheetId':self.currentSheetId,
                            'onClickAddALine':self.onClickAddALine,
                            'table':self.table,
                        }
                    }));
                    $('.o_rate_manager').replaceWith($content);
            });
        },

        _renderTableComponent: function(){
            var $content = $(QWeb.render('SheetComponent', {
                        widget: {
                            'currentSheetName':this.currentSheetName,
                            'onClickAddALine':this.onClickAddALine,
                            'table':this.table,
                        }
                    }));
            $('.sheet-component').replaceWith($content);
        },

        _renderSheetAndTableComponent:function(){
            var self = this
            var $content = $(QWeb.render('rate_manager', {
                        widget: {
                            'widget': self,
                            'productsSidebar': self.productsSidebar,
                            'currentPricelist': self.currentPricelist,
                            'selectedSheet':self.selectedSheet,
                            'currentSheetName':self.currentSheetName,
                            'currentSheetId':self.currentSheetId,
                            'onClickAddALine':self.onClickAddALine,
                            'table':self.table,
                        }
                    }));
            $('.o_rate_manager').replaceWith($content);
        },


        _onClickDropDown: function(ev) {
            $(ev.currentTarget).parent().toggleClass('open');
        },

        _redirectToTemplateListView : function(ev){
             this.do_action('ciq_template_config_ext.shop_floor_template_action');
        },

        _onClickDropDownList: function(ev) {
            $('.dropdown > .list > .item').removeClass('selected');
            $(ev.currentTarget).addClass('selected').parent().parent().removeClass('open').children('.caption').text($(ev.currentTarget).text());
            const clickedPricelistId = $(ev.currentTarget).data('id');
            if(this.currentPricelist == clickedPricelistId){
                this.displayNotification({ title: _t("Info"), type: 'info', message: _t("Template is Already Selected") });
                return;
            }
            this.currentPricelist = $(ev.currentTarget).data('id');
//            this.$pager.remove();
//            this.pager.destroy();
            var self = this
            this._getState().then(async function() {
                    if(self.pager_ids.length){
                       await self.getFirstSheetTables();
                    }else{
                        self.table = [];
                        self.currentSheetName = ""
                        self.currentSheetId = ""
                        self.selectedSheet = false
                    }
                    if(self.productsSidebar.length >= 1){
                        self.currentSheetName = self.firstSheet.name
                        self.currentSheetId = self.firstSheet.id
                    }
                    self._renderSheetAndTableComponent()
            });
        },


        openNewSheetWizard: async function(ev){
            ev.preventDefault();
            var fullContext = _.extend({}, this.context, {
                'default_template_id': this.currentPricelist
            });

            this.do_action('ciq_template_config_ext.shop_floor_create_new_sheet_wizard',{
                additional_context: fullContext,
                on_close: this._createFirstSheet.bind(this)
            });
        },

        _createFirstSheet: function(){
            var self = this
            this._getState().then(async function() {
                    if(self.pager_ids.length){
                       await self.getFirstSheetTables();
                    }else{
                        self.table = [];
                        self.currentSheetName = ""
                        self.currentSheetId = ""
                        self.selectedSheet = false
                    }
                    if(self.productsSidebar.length >= 1){
                        self.currentSheetName = self.firstSheet.name
                        self.currentSheetId = self.firstSheet.id
                    }
                    self._renderSheetAndTableComponent()
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

    });

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
    core.action_registry.add('rates_view_manager_client_action', RatesClientAction);

    return RatesClientAction;

})



