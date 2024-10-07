from odoo import api, fields, models, _

class Template(models.Model):
    _name = 'shop.floor.table'

    columns = fields.Char(string="Name", required=True)
    type_of_fields = fields.selection([('int', 'Int'), ('char', 'Char'), ('varchar', 'varchar'),('boolean', 'Boolean'),('date', 'Date'),('time', 'Time')])
    mandatory = fields.Boolean(string="mandatory", required=True)
    sheet_id = fields.Many2one('shop.floor.sheet',string="sheet_id")





