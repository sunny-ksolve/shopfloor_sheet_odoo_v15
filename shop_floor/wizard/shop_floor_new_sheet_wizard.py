from odoo import models, fields, api, _


class ShopFloorCreateNewSheetWizard(models.TransientModel):
    _name = 'shop.floor.new.sheet.wizard'
    _description = 'Create New Sheet Wizard'

    sheet_name = fields.Char(string="Name", required=True)

    def create_new_sheet(self):
        template_id = self.env.context['default_template_id']
        self.env['shop.floor.sheet'].create({'sheet_name': self.sheet_name, 'template_id': template_id})





