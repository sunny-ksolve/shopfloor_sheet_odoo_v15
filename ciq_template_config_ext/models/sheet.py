from odoo import api, fields, models, _

class Template(models.Model):
    _name = 'shop.floor.sheet'

    sheet_name = fields.Char(string="Name", required=True)
    template_id = fields.Many2one('shop.floor.template',string="Template")
    table_ids = fields.One2many('shop.floor.table','sheet_id',string="table_line")

    @api.model
    def get_table_inside_a_sheet(self,sheet_id):
        all_tables = self.env['shop.floor.table'].search([('sheet_id', '=', sheet_id)])
        tables = [{'id': rec.id, 'column': rec.column, 'type_of_fields': rec.type_of_fields, 'mandatory': rec.mandatory} for rec in all_tables]
        return tables
