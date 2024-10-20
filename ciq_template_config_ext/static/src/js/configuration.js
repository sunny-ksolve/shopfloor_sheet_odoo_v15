/** @odoo-module */

//import { Component, useState, useEffect, onWillStart } from "@odoo/owl";
const { Component, useState } = owl
const { useEnv, onWillStart } = owl.hooks;
import { registry } from '@web/core/registry';
import { useEffect, useService } from "@web/core/utils/hooks";
import Dialog from 'web.Dialog';
import { _t } from 'web.core';




export default class configuration extends Component {

    setup() {
        this.orm = useService('orm')
        this.notification = useService("notification");



        this.state = useState({
            selectedSheet: false,
            showSidebar: true,

            currentPricelist:false,
            defaultTemplateName:"",
            pricelist: [],
            pager_ids:[],
            active_ids:[],
            defaultPagerSize:20,

            productsSidebar:[],
            firstSheet :[],
            currentSheetId: null,
            currentSheetName: '',

            selectedSheet: false,
            table: [],
            onClickAddALine: false,

        });
    }

    async willStart() {
        let self = this;
        self._getState().then(async function() {
            if(self.currentPricelist){
                self.state.defaultTemplateName = self.state.pricelist.find(data=>data.id == self.state.currentPricelist).name
            }
            else if (self.state.pricelist && self.state.pricelist.length) {
                self.state.currentPricelist = self.state.pricelist[0]["id"];
                self.state.defaultTemplateName = self.state.pricelist[0]["name"];
            }
            if(self.state.pager_ids.length){
                await self.getFirstSheetTables();
            }
            if(self.state.productsSidebar.length >= 1){
                self.state.currentSheetName = self.state.firstSheet.name
                self.state.currentSheetId = self.state.firstSheet.id
            }
        });
    }

    async getFirstSheetTables(){
        const id = this.state.firstSheet.id
        const name = this.state.firstSheet.name
        try{
            this.state.table = await this.orm.call('shop.floor.sheet',
                'get_table_inside_a_sheet',
                [id],
            )
            this.state.selectedSheet = true
        }catch(error){
            console.log(error)
        }
    }


    async _getState() {
        const domain = this.domain;
        const pager_domain = [['id', 'in', this.active_ids]];
        const currentPricelist = this.state.currentPricelist;
        const state = await this.orm.call('shop.floor.table','get_rate_view_state',
        [currentPricelist, domain, pager_domain])
        this.state.productsSidebar = state.products_sidebar;
        this.state.pricelist = state.pricelist;
        this.state.pager_ids = state.pager;
        this.state.firstSheet = state.first_sheet
        this.state.active_ids = state.pager.slice(0, this.state.defaultPagerSize).map(i=>i.id);
    }

    _onClickDropDownList(id,name){
        console.log("onClickDropDownList")
        if(this.state.currentPricelist == id){
            this.notification.add(this.env._t("Template is Already Selected"), {type: "info",})
            return;
        }
        this.state.currentPricelist = id;
        this.state.defaultTemplateName = name;
        var self = this
        this.loadFirstSheet()
    }

    async onSheetClick(ev){
        const id = Number(ev.currentTarget.dataset["id"])
        const name = ev.currentTarget.dataset["name"]
        if(this.state.currentSheetId == id){
            this.notification.add(this.env._t("Sheet is Already Selected"), {type: "info",})
            return;
        }
        try{
            this.state.table = await this.orm.call('shop.floor.sheet','get_table_inside_a_sheet',[id])
            this.state.currentSheetName = name
            this.state.currentSheetId = id
            this.state.selectedSheet = true
        }catch(error){
            console.log(error)
        }
    }

    deleteSheet(ev) {
        ev.stopPropagation();
        var self = this
        var id = $(ev.currentTarget).data('id');
        Dialog.confirm(self, _t("Are you sure you want to delete this record?"), {
            confirm_callback: async ()=> {
                try{
                    await this.orm.call('shop.floor.sheet',
                        'unlink',
                        [id])
                    const index = this.state.productsSidebar.findIndex(data=>data['sheet'].id == id)
                    this.state.productsSidebar.splice(index,1)
                    if(this.state.currentSheetId == id){
                          this.loadFirstSheet()
                    }
                }catch(error){
                    console.log(error)
                }
            },
        });
    }

    editSheet(ev) {
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
                self.notification.add(_t("Input Field can't be Empty."), {type: "warning",message: "Please enter column name."})
               return
            }
            return self.orm.call(
                    'shop.floor.sheet',
                    'write',
                    [id, {
                        'sheet_name': newSheetName,
                    }],
                ).then(function(){
                    if(self.state.currentSheetId == id){
                        self.state.currentSheetName = newSheetName
                    }
                    self._getState();
                    self.dialog.close();
                }.bind(self))
        }},
        {text: _t('Discard'), close: true}],
        $content: $content,
        });
        this.dialog.open();
    }

    async onAddALineClicked(ev){
        if(this.state.onClickAddALine){
            ev.stopPropagation();

            var self = this;
            let $input = $('.configuration_input')
            var columnValue = $input.val()
            if(!columnValue || columnValue.trim() === ""){
                $input.css('border-color', 'red');
                setTimeout(function() {
                    $input.css('border-color', ''); // Reset to default color
                }, 4000);
                self.notification.add(_t("Input Field can't be Empty."), {type: "warning",message: "Please enter column name."})
                return
            }
            var type_of_fields = $('#sqlDataTypes').val()
            var mandatory = $('#mandatory').val() == "true" ? true : false;
            var sheet_id = this.state.currentSheetId
            try{
                let newTableId = await this.orm.call(
                     'shop.floor.table',
                     'create',
                     [{
                        column:columnValue,
                        type_of_fields: type_of_fields,
                        mandatory: mandatory,
                        sheet_id: sheet_id,
                    }],
                )
                this.state.onClickAddALine = false
                this.state.table = [...this.state.table,{'id': newTableId, 'column': columnValue, 'type_of_fields': type_of_fields, 'mandatory': mandatory}]
                this.notification.add(_t("New Line Added"), {type: "success"})
            }catch(e){
                this.notification.add(_t(e), {type: "danger",message: "Error"})
            }
        }else{
            this.state.onClickAddALine = true
        }
    }

    onCancleClicked(){
        this.state.onClickAddALine = false
    }

    _onResize(){
        const $sidebar = $('#sidebar');
        if (!$sidebar.hasClass('expanded')) {
            $sidebar.animate({ width: '0' }, 300)
            $sidebar.css('transform', 'translateX(-100%)'); // Slide left

        } else {
            $sidebar.css('transform', 'translateX(0)'); // Slide in
            $sidebar.animate({ width: '300px' }, 300); // Reset width
        }
        $sidebar.toggleClass('expanded');
    }


    loadFirstSheet(){
        var self = this
        this._getState().then(async function() {
                if(self.state.pager_ids.length){
                   await self.getFirstSheetTables();
                }else{
                    self.state.table = [];
                    self.state.currentSheetName = ""
                    self.state.currentSheetId = ""
                    self.state.selectedSheet = false
                }
                if(self.state.productsSidebar.length >= 1){
                    self.state.currentSheetName = self.state.firstSheet.name
                    self.state.currentSheetId = self.state.firstSheet.id
                }
        });
    }






//    toggleSidebar() {
//        this.state.showSidebar = !this.state.showSidebar;
//    }
}

configuration.template = "configuration";

registry.category("actions").add("configuration", configuration);
