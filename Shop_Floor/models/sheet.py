from odoo import api, fields, models, _

class Template(models.Model):
    _name = 'shop.floor.sheet'

    sheet_name = fields.Char(string="Name", required=True)
    template_id = fields.Many2one('shop.floor.template',string="Sheet")
    tabel_ids = fields.One2many('shop.floor.table','sheet_id',string="table_line")










