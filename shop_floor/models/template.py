from odoo import api, fields, models, _


class Template(models.Model):
    _name = 'shop.floor.template'

    @api.model
    def _default_user(self):
        return self.env.context.get('user_id', self.env.user.id)

    template_name = fields.Char(string="Name", required=True)
    user_id = fields.Many2one('res.users', string='User', default=_default_user)
    sheet_ids = fields.One2many('shop.floor.sheet', 'template_id', string='sheet_line')










