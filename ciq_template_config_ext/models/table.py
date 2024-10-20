from odoo import api, fields, models, _
from odoo.tools.safe_eval import safe_eval


class Template(models.Model):
    _name = 'shop.floor.table'

    column = fields.Char(string="column", required=True)
    type_of_fields = fields.Selection([
        ('int', 'INTEGER'),
        ('smallint', 'SMALLINT'),
        ('bigint', 'BIGINT'),
        ('serial', 'SERIAL'),
        ('boolean', 'BOOLEAN'),
        ('char', 'CHAR'),
        ('varchar', 'VARCHAR'),
        ('text', 'TEXT'),
        ('date', 'DATE'),
        ('time', 'TIME'),
        ('timestamp', 'TIMESTAMP'),
        ('float', 'FLOAT'),
        ('real', 'REAL'),
        ('numeric', 'NUMERIC'),
        ('json', 'JSON'),
        ('jsonb', 'JSONB'),
        ('bytea', 'BYTEA'),
        ('uuid', 'UUID'),
        ('array', 'ARRAY'),
        ('enum', 'ENUM'),
    ], string="Type of Fields")

    mandatory = fields.Boolean(string="mandatory", required=True)
    sheet_id = fields.Many2one('shop.floor.sheet', string="sheet_id")

    @api.model
    def get_rate_view_state(self, selectedTemplate=False, domain=None, pager_domain=None,
                            on_search=False):
        if pager_domain is None:
            pager_domain = []
        if domain is None:
            domain = []
        sheet_lines = []
        domain = safe_eval(str(domain))
        sheet_ids = []
        sheets = []

        templates = self.env['shop.floor.template'].search([]).sorted(lambda x: x.id)
        templates_data = [{'id': rec.id, 'name': rec.template_name} for rec in templates]

        if len(templates) and not selectedTemplate:
            selectedTemplate = templates[0].id

        if len(templates):
            sheets = self.env['shop.floor.sheet'].search([('template_id','=',selectedTemplate)] + domain)

        for sheet in sheets:
            sheet_data = {
                'sheet': {'id': sheet.id, 'name': sheet.sheet_name}
            }
            sheet_ids += sheet.ids
            sheet_lines.append(sheet_data)

        total_sheet_ids = [{'id': rec} for rec in sheet_ids]
        first_sheet = sheet_lines[0].get('sheet') if len(sheet_lines) else {}

        return {
            'pager': total_sheet_ids,
            'pricelist': templates_data,
            'products_sidebar': sheet_lines,
            'first_sheet':first_sheet,
        }
