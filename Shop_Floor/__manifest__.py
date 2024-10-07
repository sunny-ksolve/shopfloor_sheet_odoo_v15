{
    "name": "Shop_Floor",
    "author": "Priyanshu Yadav",

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
            'Shop_Floor/static/src/js/**/*.js',
            'Shop_Floor/static/src/scss/**/*.scss',
        ],
        'web.assets_qweb': [
            'Shop_Floor/static/src/xml/**/*.xml',
        ]
    },
    'license': 'LGPL-3',

}
