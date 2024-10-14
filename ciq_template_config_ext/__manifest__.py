{
    "name": "CIQ Config Template Extension",
    "author": "Nokia",
    'version': '15.0.1.0',
    'sequence': -1,
    'summary': 'Nokia ngDCM CIQ Configuration Extension',
    'category': 'Tools',
    'website': "www.nokia.com",
    'description': 'Nokia ngDCM CIQ Configuration Extension',
    'depends': ["base", "base_setup", "mail", "ngdcm_app"],
    "data": [
        'security/ir.model.access.csv',
        'views/sheet.xml',
        'wizard/shop_floor_new_sheet_wizard.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'assets': {
        'web.assets_backend': [
            'ciq_template_config_ext/static/src/js/**/*.js',
            'ciq_template_config_ext/static/src/scss/**/*.scss',
        ],
        'web.assets_qweb': [
            'ciq_template_config_ext/static/src/xml/**/*.xml',
        ]
    },
    'license': 'LGPL-3',
}
