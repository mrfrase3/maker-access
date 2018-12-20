"use strict";

var cardReader;

if(typeof require === 'function'){
	try {
		const MasterRD = require(__dirname+"/../../app/MasterRDWrapper.js");
		cardReader = new MasterRD();
    	cardReader.on("error", console.log);
		cardReader.connect();
    	
	} catch(e) {console.error(e);}
	const shell = require('electron').shell;
		
    $("body").addClass("electron-enabled");
    
    $(".titlebar .window-refresh").click(()=>{
       	window.location.reload();
    });
    
    $(".titlebar .window-min").click(()=>{
       	const { remote } = require('electron')
		remote.BrowserWindow.getFocusedWindow().minimize();
    });
    
    $(".titlebar .window-close").click(()=>{
       	window.close();
    });
}