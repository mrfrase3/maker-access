Handlebars.registerHelper('ifeq', function(a, b, options) {
  if(a == b) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});
Handlebars.registerHelper('contains', function(arr, b, options) {
	if(arr && arr.indexOf(b) !== -1) {
	  return options.fn(this);
	} else {
	  return options.inverse(this);
	}
});

{
	var templates = {
    	"main-menu": Handlebars.compile($(".main-menu-template").html()),
        "main-navbar": Handlebars.compile($(".main-navbar-template").html())
    };

	var cardManager = null;

	var displayError = function(err){
    	swal.close();
    	swal({
            	title: err.title || "Error",
            	type: err.type || "warning",
        		html: err.message || "An error occured."
        });
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
        } else if(name == "training-config-menu"){
        	socket.once("main.trainingConfigContent", function(menu){
            	trainingConfigMenu(menu);
            	cb();
            });
        	socket.emit("main.trainingConfigContent");
        } else if(name == "keys-menu"){
        	socket.once("main.keysContent", function(menu){
            	cardManager = new PhemeCardManager(menu.userToken);
            	cardManager.find().catch(displayError).then(function(cards){
                	menu.keys = cards.map(card=>{
                    	let createdAt = new Date(card.createdAt);
                    	return Object.assign({}, card, {
                    	    created: createdAt.getFullYear() + '-' + (createdAt.getMonth()+1) + '-' + createdAt.getDate(),
                    	});
                    });
                	keysMenu(menu);
                	cb();
                });
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
            	$('.login form button[type="submit"]').text('Enter Your Pheme Login To Join!!!');
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
    	$(".login .login-error").html(error.message || error.msg);
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

	socket.on("main.error", displayError);

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
    	$(".training-config").click((e)=>{
        	e.preventDefault();
        	showRow("training-config-menu");
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
    
    	$(".pass4perm").click(function(e){
        	e.preventDefault();
        	var perm = $(this).attr("data-perm");
            console.log("passing for perm: " + perm)
			swal({
				title: 'Enter the magic password',
				input: 'password',
				inputPlaceholder: 'SuperSecretPassword',
				inputAttributes: {
                	'maxlength': 100,
                	'autocapitalize': 'off',
                	'autocorrect': 'off'
            	}
        	}).then(result=>{
            	if(result) {
                	console.log("sending password attempt");
                	socket.emit("main.pass4perm", {pass: result, perm: perm});
                }
            }).catch(swal.noop);
        });
    
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
			var label = null;
        	var course = $(this)
        	while(!label){
            	course = course.parent();
            	label = course.attr("data-label");
            }
        	var message = "Inductor login with Pheme:<br>"
        	if(cardReader && cardReader.isConnected) message = "Inductor login with Pheme or Scan Card:<br>"
        	swal({
            	title: "The Inductor's Confirmation of Completion",
            	type: "info",
            	html: message+
    				'<input type="text" id="swal-input-user" class="swal2-input" placeholder="12345678" autocomplete="off">' +
    				'<input type="password" id="swal-input-pass" class="swal2-input" placeholder="Password" autocomplete="off">',
            	focusConfirm: false,
  				preConfirm: () => {
                	socket.emit("training.induct", {user: $('#swal-input-user').val(), pass: $('#swal-input-pass').val(), label: label});
                	$('#swal-input-pass').val("");
    				return;
  				},
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
        	if(!cardReader || !cardReader.isConnected) return;
        	setTimeout(()=>{
            	$(".swal2-container .swal2-info").html('<i class="fa fa-wifi" style="transform: rotate(90deg);line-height:inherit;"></i>');
            }, 50);
        });
    }
    
    var trainingConfigMenu = function(menu){
		$(".row.training-config-menu div").html(templates["training-config-menu"](menu));
    	$("nav .navbar-main, nav .navbar-back").show();
    	$("nav .navbar-main li").removeClass("active");
		$("nav .navbar-main .training-config").addClass("active");
		
		// Training Actions
		$('.add-module').click(function(){
			var training = getTrainingConfig();
			training.push({title: 'New Training Module', label: 'new-training-module', perms: []});
			trainingConfigMenu(training);
		});
		$('.add-divider').click(function(){
			var training = getTrainingConfig();
			training.push({hr: true});
			trainingConfigMenu(training);
		});
		$('.tc-cancel').click(function(){showRow('main-menu')});
		$('.tc-save').click(function(){socket.emit('trainingConfig.save', getTrainingConfig())});
		$('.tc-validate').click(function(){socket.emit('trainingConfig.validate', getTrainingConfig())});

		// module Actions
		$('.ass-add').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			training[mod].assessments.push({title: 'New Assessment Item', type: 'comment-link'});
			trainingConfigMenu(training);
		});
		$('.mail-add').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			if (!training[mod].accessmail) training[mod].accessmail = [];
			training[mod].accessmail.push({email: {subject: 'New Email Notification'}, sendon: 'weekly'});
			trainingConfigMenu(training);
		});
		$('.mod-delete').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			training.splice(mod, 1);
			trainingConfigMenu(training);
		});
		$('.mod-up').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			training.splice(mod-1, 0, training.splice(mod, 1)[0]);
			trainingConfigMenu(training);
		});
		$('.mod-down').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			training.splice(mod+1, 0, training.splice(mod, 1)[0]);
			trainingConfigMenu(training);
		});
		$('.mod-title').keyup(function(){
			$(this).parents('.mod-item').find('.panel-title').text($(this).val());
		});

		// Assessment Actions
		$('.ass-delete').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			var ass = Number($(this).attr('data-ass'));
			training[mod].assessments.splice(ass, 1);
			trainingConfigMenu(training);
		});
		$('.ass-up').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			var ass = Number($(this).attr('data-ass'));
			training[mod].assessments.splice(ass-1, 0, training[mod].assessments.splice(ass, 1)[0]);
			trainingConfigMenu(training);
		});
		$('.ass-down').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			var ass = Number($(this).attr('data-ass'));
			training[mod].assessments.splice(ass+1, 0, training[mod].assessments.splice(ass, 1)[0]);
			trainingConfigMenu(training);
		});
		$('.ass-type').change(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			var ass = Number($(this).attr('data-ass'));
			trainingConfigMenu(training);
			$('#accord-tc-'+mod+'-'+ass).prop('checked', true);
		});
		$('.ass-title').keyup(function(){
			$(this).parents('.ass-item').find('.accord-tc-label').text($(this).val());
		});

		// Mail Actions
		$('.mail-delete').click(function(){
			var training = getTrainingConfig();
			var mod = Number($(this).attr('data-mod'));
			var mail = Number($(this).attr('data-mail'));
			training[mod].accessmail.splice(mail, 1);
			if(!training[mod].accessmail.length) delete training[mod].accessmail;
			trainingConfigMenu(training);
		});
		$('.mail-sendon').change(function(){
			$(this).parents('.mail-item').find('.show-weekly').toggle($(this).val() === 'weekly');
		});
		$('.mail-subject').keyup(function(){
			$(this).parents('.mail-item').find('.accord-tc-label').text($(this).val());
		});

		$('.accord-tc-label').click(function(e){
			e.preventDefault();
			$input = $('#' + $(this).attr('for'));
			$input.prop('checked', !$input.prop('checked'));
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
            	cardManager.delete($(self).parent().attr("card-id")).catch(displayError).then(function(card){
            		$('li[card-id="'+card.cardId+'"]').remove();
                });
            }).catch(swal.noop);
        });
    	$(".row.keys-menu .add-key").click((e)=>{
        	e.preventDefault();
        	swal({
            	title: 'What would you like to name your card?',
            	text: '(optional)',
            	type: 'question',
            	input: 'text',
            	inputPlaceholder: 'Student Card',
            	showCancelButton: true,
            	showConfirmButton: true,
            	confirmButtonText: "Next",
            }).catch(swal.noop).then(function(res){
            	var name = res || '';
        		swal({
            		title: "Scan New Card to Add",
            		type: "info",
            		onOpen: ()=>{
                		if(cardReader && cardReader.isConnected){
            				cardReader.on("scan", function(uid){
                	        	const { remote } = require('electron')
								if(remote.BrowserWindow.getFocusedWindow()){
                                	var uuid = [uid.byte[0], uid.byte[1], uid.byte[2], uid.byte[3]];
                					cardManager.create(uuid, name).catch(displayError).then(function(card){
                                    	menu.keys = cardManager.cards;
                                    	swal.close();
                                    	keysMenu(menu);
                                    });
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
        });
    	
    	$('.keys-menu span[contenteditable="true"]').blur(function(ev){
        	const cardId = $(this).parent().attr('card-id');
        	$(this).text($(this).text().replace('\n', '').trim());
        	cardManager.patch(cardId, $(this).text()).catch(displayError);
        });
    	$('.keys-menu span[contenteditable="true"]').keyup(function(ev){
        	if((ev.key && ev.key.toLowerCase() === 'enter') || ev.which === 13 ){
            	ev.preventDefault();
            	$(this).blur();
            }
        });
    }
    
    var usersMenu = function(menu){
    	var $menuUsers = $(".row.users-menu .users-menu-users");
    	if(menu.write) $menuUsers.addClass("can-write");
    	menu.users.sort(function (a, b) {
			return a.fullname.toLowerCase().localeCompare(b.fullname.toLowerCase());
		});
    
    	var renderUser = function(user){ $menuUsers.append(templates["users-menu"](user)); };
    
    	var renderUsers = function(){
        	let search = $(".users-menu input[type=text]").val();
        	$(".row.users-menu .users-menu-users > div").remove();
            if(search.length < 3) return $menuUsers.append('<div>Search 3 or more characters to find a user/permission</div>');
        	let count = 0;
            for(var i in menu.users){
            	var user = menu.users[i];
            	if(
                	user.username.indexOf(search) !== -1 ||
                	user.fullname.toLowerCase().indexOf(search) !== -1 ||
					user.perms.reduce(function(a, perm){
                    	if(perm.perm.indexOf(search) !== -1) a.push(perm);
                    	return a;
                    }, []).length > 0
                ){
                 	count++;
                	if(count > 31) continue;
                	renderUser(user);
                }
            }
        
        	if(count > 31) $menuUsers.append(`<div>Only showing 30 of ${count} users, please refine your search.</div>`);
        
        $(".users-menu-users label").click(function(e){
            if(!$(this).attr("for")) return;
            let radio = $("input#"+$(this).attr("for"));
            if(radio.prop("checked")){
                radio.prop({checked: false});
                e.preventDefault();
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
        
        };
    	renderUsers();
    	
    	$("nav .navbar-main, nav .navbar-back").show();
    	$("nav .navbar-main li").removeClass("active");
    	$("nav .navbar-main .users").addClass("active");
    
    	$(".users-menu input[type=text]").keyup(()=>{
        	return renderUsers();
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
    
	}

	var str2arr = function(str){ return str.replace(/\s/g, '').split(','); };
	
	var getTrainingConfig = function(){
		var training = [];
		$('.mod-item').each(function(i){
			var $mod = $(this);
			if($mod.has('.mod-divider').length) return training.push({hr: true});
			var module = {
				title: $mod.find('.mod-title').val().trim(),
				label: $mod.find('.mod-label').val().replace(/[^\w-]/g, ''),
				perms: str2arr($mod.find('.mod-perms').val()),
				assessments: [],
			};
			$mod.find('.ass-item').each(function(j){
				var $ass = $(this);
				var assessment = {
					title: $ass.find('.ass-title').val().trim(),
					type: $ass.find('.ass-type').val().trim(),
					required: $ass.has('.ass-required:checked').length > 0,
					link: $ass.find('.ass-link').val(),
					results: $ass.find('.ass-results').val(),
					reqmark: Number($ass.find('.ass-reqmark').val()) || 0,
					perm: $ass.find('.ass-perm').val(),
					trainingPerm: $ass.find('.ass-trainingPerm').val(),
					time: Number($ass.find('.ass-time').val()) || 0,
				};
				module.assessments.push(assessment);
			});
			if(!$mod.has('.mail-item').length) return training.push(module);
			module.accessmail = [];
			$mod.find('.mail-item').each(function(j){
				var $mail = $(this);
				var mail = {
					type: $mail.find('.mail-type').val().trim(),
					sendon: $mail.find('.mail-sendon').val().trim(),
					email: {
						subject: $mail.find('.mail-subject').val().trim(),
						from: $mail.find('.mail-from').val().trim(),
						to: str2arr($mail.find('.mail-to').val()),
						cc: str2arr($mail.find('.mail-cc').val()),
						bcc: str2arr($mail.find('.mail-bcc').val()),
						html: $mail.find('.mail-html').val().trim(),
					},
				};
				if(mail.sendon === 'weekly') {
					mail.hour = Number($mail.find('.mail-hour').val()) || 0;
					mail.days = [];
					$mail.find('input[name=mail-days-'+i+'-'+j+']:checked').each(function(){
						mail.days.push(Number($(this).val()));
					});
				}
				module.accessmail.push(mail);
			});
			return training.push(module);
		});
		return training;
	};

}