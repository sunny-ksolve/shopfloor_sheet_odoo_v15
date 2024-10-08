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
    def get_active_ids(self, currentpricelist=False, domain=None):
        if domain is None:
            domain = []
        total_children_ids = []
        domain = safe_eval(str(domain))

        pricelist_ids = self.env['shop.floor.template'].search([]).sorted(lambda x: x.id)
        if len(pricelist_ids) and not currentpricelist:
            currentpricelist = pricelist_ids[0].id
        if currentpricelist:
            currentpricelist = currentpricelist

        for i in range(0, len(domain)):
            if type(domain[i]) == list:
                if isinstance(domain[i][2], int):
                    domain[i][0] = 'id'
                else:
                    domain[i][0] = 'name'

        childrens = self.env['shop.floor.sheet'].search(
            [('template_id', '=', currentpricelist)] + domain)

        if len(childrens):
            total_children_ids += childrens.ids

        total_children_ids = [{'id': rec} for rec in total_children_ids]
        return {
            'pager': total_children_ids,
        }


    @api.model
    def get_rate_view_state(self, currentpricelist=False, domain=None, pager_domain=None,
                            on_search=False):
        if pager_domain is None:
            pager_domain = []
        if domain is None:
            domain = []
        data_lines = []
        hotel_data = {}
        hotel_data_key = []
        categs_key = []
        hotels_rec = []
        total_children_ids = []
        pager_recordset = []
        domain = safe_eval(str(domain))
        remaining_categ_key = []

        pricelist_ids = self.env['shop.floor.template'].search([]).sorted(lambda x: x.id)
        pricelist_data = [{'id': rec.id, 'name': rec.template_name} for rec in pricelist_ids]

        if len(pricelist_ids) and not currentpricelist:
            currentpricelist = pricelist_ids[0].id

        if currentpricelist:
            currentpricelist = currentpricelist
            hotels_rec = self.env['shop.floor.table'].search([('sheet_id.template_id', '=', currentpricelist)] + domain)
            categs_key = hotels_rec.mapped('sheet_id').mapped('id')
            remaining_categ_key = self.env['shop.floor.sheet'].search(
            [('template_id', '=', currentpricelist),('id','not in',categs_key)] + domain)
            categs_key.extend(remaining_categ_key.mapped('id'))

        for categ_key in categs_key:
            hotel_data.update({
                'sheet_id_' + str(categ_key): []
            })
            hotel_data_key.append(categ_key)

        # filter table accourding to sheet_id
        for hotel_rec in hotels_rec:
            if hotel_rec.sheet_id.id in hotel_data_key:
                hotel_data['sheet_id_' + str(hotel_rec.sheet_id.id)].append(hotel_rec)

        if not len(domain) or (len(domain) and not len(hotels_rec)):
            categ_ids = self.env['shop.floor.table'].search([('sheet_id.template_id', '=', currentpricelist)]).mapped(
                'sheet_id')
            if categ_ids or remaining_categ_key:
                categ_ids = categ_ids + remaining_categ_key
        else:
            categ_ids = hotels_rec.mapped('sheet_id')
            if categ_ids or remaining_categ_key:
                categ_ids = categ_ids + remaining_categ_key
        if not on_search and not len(domain) and len(pager_domain[0][2]):
            pager_domain = safe_eval(str(pager_domain))
            pager_recordset = self.env['shop.floor.sheet'].search(pager_domain)

        categ_ls = []
        for categ_id in categ_ids:
            categ_data = {
                'categ': {'id': categ_id.id, 'name': categ_id.sheet_name}
            }
            for i in range(0, len(domain)):
                if type(domain[i]) == list:
                    if isinstance(domain[i][2], int):
                        if domain[i][0] == 'categ_id':
                            domain[i][1] = '='
                        else:
                            domain[i][0] = 'id'
                    elif domain[i][0] == 'product_id':
                        domain[i][0] = 'name'
            childrens = self.env['shop.floor.table'].search([('sheet_id', '=', categ_id.id)] + domain)

            # getting only pager records
            # if pager_recordset:
            #     childrens = childrens & pager_recordset

            childrens_list = []

            if not len(childrens):
                total_children_ids += categ_id.ids
                categ_data.update({
                    'childrens': childrens_list
                })
                data_lines.append(categ_data)

                continue

            total_children_ids += categ_id.ids
            for child in childrens:
                childrens_list.append({'id': child.id, 'table_data': [{
                    'column': rec.column,
                    'type_of_fields': rec.type_of_fields,
                    'mandatory': rec.mandatory
                }
                    for rec in hotel_data.get('sheet_id_' + str(categ_id.id))
                    if rec.id == child.id
                ]
                if len(hotel_data) and hotel_data.get('sheet_id_' + str(categ_id.id), False) else {}
                                       })

            categ_data.update({
                'childrens': childrens_list
            })
            data_lines.append(categ_data)

        total_children_ids = [{'id': rec} for rec in total_children_ids]

        return {
            'company_id': self.env.company.id,
            'pager': total_children_ids,
            'pricelist': pricelist_data,
            'products_sidebar': data_lines,
        }
