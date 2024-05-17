
            nDelay = 290;//延迟毫秒数
            //禁止自动弹出的(按钮)黑名单。CSS语法: #表示id  .表示class
            blackIDs = ['#back-button','#forward-button','#pocket-button','#alltabs-button']; //'.bookmark-item',
            //by xinggsf, 白名单，及触发动作
            whiteIDs = [
            {//三道杠按钮、面板
                id : PanelUI.menuButton.id, //必填：按钮ID
                popMenu : PanelUI.panel.id, //菜单ID
                open: btn => PanelUI.show(),//要使用菜单DOM: $('PanelUI-popup')
                close: menu => PanelUI.hide()
            },
            {//下载面板
                id : 'downloads-button',
                popMenu : '',
                open: e => DownloadsPanel.showPanel(),
                close: e => DownloadsPanel.hidePanel()
            }, {
                id : gUnifiedExtensions.button.id,
                popMenu : '',
                open: e => gUnifiedExtensions.togglePanel(),
                close: e => gUnifiedExtensions.togglePanel()
            }];