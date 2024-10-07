/** @odoo-module */

const { Component, useState } = owl
const { useEnv, onWillStart } = owl.hooks;
import { registry } from '@web/core/registry';
import { useEffect, useService } from "@web/core/utils/hooks";
import { session } from "@web/session";


export default class shopFloorComponent extends Component {

  increment() {
    this.state.value++;
  }

  setup() {
    this.state = useState({
        value: 0,
        currentUserId: session.uid,
        currentUser:'',
        templates:[],
        sheets: [],
     });



    onWillStart(async() => {
        console.log("hello world")
        console.log(session)
        this.templates = await this.env.services.orm.searchRead(
            "shop.floor.template",
            [],
            ["id", "template_name"],
        );
        console.log(this.currentUser)

    });
  }
}

shopFloorComponent.template = "shop_floor_js_view"
registry.category("actions").add("shop_floor_js_view", shopFloorComponent);
