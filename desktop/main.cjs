const {app,BrowserWindow,shell}=require('electron');
const GAME='https://china-chaos.onrender.com';
function create(){const w=new BrowserWindow({width:1440,height:900,minWidth:1000,minHeight:650,autoHideMenuBar:true,backgroundColor:'#09070a',webPreferences:{contextIsolation:true,sandbox:true}});w.loadURL(GAME);w.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith(GAME)||url.startsWith('https://discord.com/'))return{action:'allow'};shell.openExternal(url);return{action:'deny'}})}
app.whenReady().then(create);app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)create()});
