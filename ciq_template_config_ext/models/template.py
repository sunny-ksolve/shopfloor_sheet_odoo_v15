from odoo import api, fields, models, _


class Template(models.Model):
    _name = 'shop.floor.template'
    _rec_name = 'template_name'

    shop_floor_template_sheet_count = fields.Integer(compute='_compute_template_sheets_count', string='Number of Sheets', store=True)
    template_name = fields.Char(string="Name", required=True)
    user_id = fields.Many2one('res.users', string='User', default=lambda self: self.env.user)
    sheet_ids = fields.One2many('shop.floor.sheet', 'template_id', string='sheet_line')

    @api.depends('sheet_ids')
    def _compute_template_sheets_count(self):
        for order in self:
            order.shop_floor_template_sheet_count = len(order.sheet_ids)









