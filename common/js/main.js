{
	var templates = {
    	"main-menu": Handlebars.compile($(".main-menu-template").html()),
        "main-navbar": Handlebars.compile($(".main-navbar-template").html())
    };
	
	var showRow = function(name, data){
    	var cb = function(){
        	$(".navbar-toggle:not(.collapsed)").click();
    		$(".row").hide();
    		$(".row."+name).show();
        	if($("body").hasClass("electron-enabled")){
            	$('a[target="_blank"]').click((event) => {
					event.preventDefault();
                	console.log(event.target.href + " - " + $(this).attr("href"));
                	let shell = require('electron').shell;
					shell.openExternal(event.target.href);
				});
            }
        }
        if(cardReader && cardReader.isConnected){
        	cardReader.removeAllListeners("scan");
        	if(cardReader.isScanning) cardReader.stop();
        }
    	swal.close();
        
    	if(name == "main-menu"){
        	socket.once("main.menuContent", function(menu){
            	mainMenu(menu);
            	cb();
            });
        	socket.emit("main.menuContent");
        	if(window.location.search.indexOf('join') !== -1 && window.location.search.indexOf('joinbatch') === -1){
            	$('.login form button[type="submit"]').text('Login');
            	history.replaceState(history.state, document.title, '/');
            }
        } else if(name == "training-menu"){
        	$(".training .fa").removeClass("fa-graduation-cap");
        	$(".training .fa").addClass("fa-circle-o-notch fa-spin");
        	socket.once("main.trainingContent", function(menu){
            	trainingMenu(menu);
            	cb();
            	$(".training .fa").addClass("fa-graduation-cap");
        		$(".training .fa").removeClass("fa-circle-o-notch fa-spin");
            });
        	socket.emit("main.trainingContent");
        } else if(name == "keys-menu"){
        	socket.once("main.keysContent", function(menu){
            	keysMenu(menu);
            	cb();
            });
        	socket.emit("main.keysContent");
        } else if(name == "users-menu"){
        	var context;
        	if($(".users-menu").is(":visible")){
            	context = {
                	search: $(".users-menu input[type=text]").val(),
                	user: $(".users-menu input[name=users-usercb]:checked").val(),
                	perm: $(".users-menu input[name=users-usercb-perm]:checked").val()
                }
                if(!Array.isArray(context.user)) context.user = [context.user];
                if(!Array.isArray(context.perm)) context.perm = [context.perm];
            }
        	socket.once("main.usersContent", function(menu){
            	usersMenu(menu);
            	if(context){
                	$(".users-menu input[type=text]").val(context.search);
                	$(".users-menu input[type=text]").keyup();
                	$(".users-menu input[name=users-usercb]").val(context.user);
                	$(".users-menu input[name=users-usercb-perm]").val(context.perm);
                }
            	cb();
            });
        	socket.emit("main.usersContent");
        } else if(name == "login"){
        	if(cardReader && cardReader.isConnected){
        		$(".login .uid-wrap").show();
            	cardReader.on("scan", function(uid){
                	const { remote } = require('electron')
					if(remote.BrowserWindow.getFocusedWindow()){
                		socket.emit("auth.login", {uid: "" + uid.byte[0] + uid.byte[1] + uid.byte[2] + uid.byte[3]});
                    }
                });
            	cardReader.start();
            }
        	if(window.location.search.indexOf('join') !== -1){
            	$('.login form button[type="submit"]').text('Join');
            }
        	cb();
        } else {
        	cb();
        }
    }

	socket = io.connect();

	socket.on("auth.loggedout", function(){
    	$("nav .navbar-fullname a").text("");
    	$("nav").hide();
    	$.post("/sockauth", {}, function(result){
    		if(result.success) socket.emit("auth.login", {token: result.token});
            else showRow("login");
        	if(result.message) console.log(result.message);
        }, "json");
    });

	socket.on("auth.error", (error)=>{
    	$(".login .login-error").html(error.message);
    });

	socket.on("auth.makesession", function(token){
    	console.log(token + "");
    	$.post("/sockauth", {token: token}, function(result){
        	if(!result.success && result.message){
            	console.error(result.message);
            }
        }, "json");
    });

	$(".login form").submit((e)=>{
    	e.preventDefault();
    	var data = {
        	user: $(".login form #user").val(),
        	pass: $(".login form #pass").val()
        };
    	$(".login form #user").val("");
        $(".login form #pass").val("");
    	socket.emit("auth.login", data);
    });

	$("nav .navbar-brand").click((e)=>{
    	e.preventDefault();
    	showRow("main-menu");
    });

	socket.on("main.show", showRow);

	socket.on("main.userInfo", (info)=>{
    	$("nav .navbar-fullname a").text(info.fullname + " (" + info.username + ")");
    });

	socket.on("main.error", function(err){
    	swal.close();
    	swal({
            	title: err.title || "Error",
            	type: err.type || "warning",
        		text: err.message || "An error occured."
        });
    });

	var mainMenu = function(menu){
    	$(".row.main-menu div").html(templates["main-menu"](menu));
    	$("nav .navbar-main").html(templates["main-navbar"](menu));
    	$("nav").show();
    	$("nav .navbar-main, nav .navbar-back").hide();
    	$(".logout").click((e)=>{
        	e.preventDefault();
        	$.post("/sockauth", {logout: true}, function(result){
        		if(result.success) socket.emit("auth.logout");
            }, "json");
        });
    	$(".training").click((e)=>{
        	e.preventDefault();
        	showRow("training-menu");
        });
    	$(".keys").click((e)=>{
        	e.preventDefault();
        	showRow("keys-menu");
        });
    	$(".users").click((e)=>{
        	e.preventDefault();
        	showRow("users-menu");
        });
    	$(".join").click(e => {
        	e.preventDefault();
        	swal({
				title: 'Join Makers',
            	type: 'info',
            	text: 'We will send you important emails every once and a while.',
				input: 'checkbox',
				inputValue: 1,
				inputPlaceholder: '  Send me the newsletters as well.',
				confirmButtonText: 'Join <i class="fa fa-arrow-right></i>',
            	showCancelButton: true,
            	cancelButtonText: 'Logout'
			}).then(function (result) {
            	socket.emit('joining.join', result);
            	socket.once('joining.joined', ()=>{
  					swal({
    					type: 'success',
    					title: 'You\'ve joined the makers!',
                    	showCloseButton: true,
                    	timer: 4000
					});
                });
			}).catch(function (reason) {
  				if(reason == 'cancel') $(".logout").click();
			});
        });
    	$(".join").click();
    
    	for(let i in menu){
        	if(menu[i].templates){
            	for(let j in menu[i].templates){
            		templates[j] = Handlebars.compile(menu[i].templates[j]);
                }
            }
        }
    }
    
    var trainingMenu = function(menu){
    	$(".row.training-menu div").html(templates["training-menu"](menu));
    	$("nav .navbar-main, nav .navbar-back").show();
    	$("nav .navbar-main li").removeClass("active");
    	$("nav .navbar-main .training").addClass("active");
    
    	$(".row.training-menu .inperson-induction").click(function(e){
        	e.preventDefault();
        	if($(this).hasClass("complete")) return;
        	if(!cardReader || !cardReader.isConnected) return;
			var label = null;
        	var course = $(this)
        	while(!label){
            	course = course.parent();
            	label = course.attr("data-label");
            }
        	swal({
            	title: "Scan Inductor's Card for Confirmation of Completion",
            	type: "info",
            	onOpen: ()=>{
                	if(cardReader && cardReader.isConnected){
            			cardReader.on("scan", function(uid){
                        	const { remote } = require('electron')
							if(remote.BrowserWindow.getFocusedWindow()){
                				socket.emit("training.induct", {uid: "" + uid.byte[0] + uid.byte[1] + uid.byte[2] + uid.byte[3], label: label});
                            }
                		});
            			cardReader.start();
            		}
                },
            	onClose: ()=>{
                	if(cardReader && cardReader.isConnected){
        				cardReader.removeAllListeners("scan");
        				if(cardReader.isScanning) cardReader.stop();
        			}
                }
            });
        	setTimeout(()=>{
            	$(".swal2-container .swal2-info").html('<i class="fa fa-wifi" style="transform: rotate(90deg);line-height:inherit;"></i>');
            }, 50);
        });
    }
    
    var keysMenu = function(menu){
    	$(".row.keys-menu div").html(templates["keys-menu"](menu));
    	$("nav .navbar-main, nav .navbar-back").show();
    	$("nav .navbar-main li").removeClass("active");
    	$("nav .navbar-main .keys").addClass("active");
    
    	if(cardReader && cardReader.isConnected){
        	$(".row.keys-menu .add-key").show();
        }
    
    	$(".row.keys-menu .fa-trash").click(function(e){
        	e.preventDefault();
        	var self = this;
        	swal({
				title: "Are you sure?",
            	text: "Do you wish to remove this card from your list?",
            	type: "question",
            	showCancelButton: true,
            	showConfirmButton: true,
            	confirmButtonText: "Remove",
            	confirmButtonColor: "red"
			}).then(function(){
            	socket.emit("keys.remove",  $(self).parent().attr("index") );
            	console.log($(self).parent().attr("index"));
            }).catch(swal.noop);
        });
    	$(".row.keys-menu .add-key").click((e)=>{
        	e.preventDefault();
        	swal({
            	title: "Scan New Card to Add",
            	type: "info",
            	onOpen: ()=>{
                	if(cardReader && cardReader.isConnected){
            			cardReader.on("scan", function(uid){
                        	const { remote } = require('electron')
							if(remote.BrowserWindow.getFocusedWindow()){
                				socket.emit("keys.add", {uid: "" + uid.byte[0] + uid.byte[1] + uid.byte[2] + uid.byte[3]});
                            }
                		});
            			cardReader.start();
            		}
                },
            	onClose: ()=>{
                	if(cardReader && cardReader.isConnected){
        				cardReader.removeAllListeners("scan");
        				if(cardReader.isScanning) cardReader.stop();
        			}
                }
            }).catch(swal.noop);
        	setTimeout(()=>{
            	$(".swal2-container .swal2-info").html('<i class="fa fa-wifi" style="transform: rotate(90deg);line-height:inherit;"></i>');
            }, 50);
        });
    }
    
    var usersMenu = function(menu){
    	if(menu.write) $(".row.users-menu .users-menu-users").addClass("can-write");
    	menu.users.sort(function (a, b) {
			return a.fullname.toLowerCase().localeCompare(b.fullname.toLowerCase());
		});
    	$(".row.users-menu .users-menu-users > div").remove();
    	for(var i in menu.users){
    		$(".row.users-menu .users-menu-users").append(templates["users-menu"](menu.users[i]));
    	}
    	$("nav .navbar-main, nav .navbar-back").show();
    	$("nav .navbar-main li").removeClass("active");
    	$("nav .navbar-main .users").addClass("active");
    
    	$(".users-menu-users label").click(function(e){
        	if(!$(this).attr("for")) return;
        	let radio = $("input#"+$(this).attr("for"));
        	if(radio.prop("checked")){
            	radio.prop({checked: false});
            	e.preventDefault();
            }
        });
    
    	$(".users-menu input[type=text]").keyup(()=>{
        	let search = $(".users-menu input[type=text]").val();
        	$(".users-menu-users > .list-group-item").show();
        	if(search){
            	$(".users-menu-users > .list-group-item").each(function(){
                	if($(this).text().toLowerCase().indexOf(search.toLowerCase()) === -1){
                    	$(this).hide();
                    }
                });
            }
        });
    
    	$(".users-menu-users.can-write .users-perm-add").click(function(e){
        	var self = this;
        	if( $("input#users-usercb-"+$(self).attr("data-user") ).is(":checked") ){
            	e.preventDefault();
            	setTimeout(()=>{
                	$("input#users-usercb-"+$(self).attr("data-user") ).prop("checked", true);
                }, 10);
            }
        	swal({
				title: 'Select a Permission to Add',
				input: 'select',
				inputOptions: menu.editable,
				inputPlaceholder: 'Select Permission',
				showCancelButton: true
			}).then(function (result) {
				socket.emit("users.perm-write", {username: $(self).attr("data-user"), perm: menu.editable[result], action: "add"});
			}).catch(swal.noop);
        });
    
    	$(".users-menu-users.can-write .writable .users-perm-remove").click(function(e){
        	if( !$("input[value=\""+$(this).attr("data-user")+"-"+$(this).attr("data-perm")+"\"]" ).is(":checked") ){
            	e.preventDefault();
            }
        	socket.emit("users.perm-write", {username: $(this).attr("data-user"), perm: $(this).attr("data-perm"), action: "remove"});
        });
    
    	$(".users-menu-users.can-write .perm-enable-toggle").click(function(e){
        	socket.emit("users.perm-write", {username: $(this).attr("data-user"), perm: $(this).attr("data-perm"), action: "toggle"});
        });
    
    }

}