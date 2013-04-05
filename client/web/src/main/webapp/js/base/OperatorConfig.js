"use strict";
var Poker = Poker || {};

/**
 * @type {Poker.OperatorConfig}
 */
Poker.OperatorConfig = Class.extend({
	operatorId : null,
	
    /**
     * @type Poker.Map
     */
    configMap : null,

    /**
     * @type Boolean
     */
    populated : false,
    init : function() {
        this.configMap = new Poker.Map();
    },
    isPopulated : function() {
        return this.populated;
    },
    populate : function(params) {
        for(var p in params) {
          this.configMap.put(p,params[p]);
        }
        this.populated = true;
    },
    getLogoutUrl : function() {
    	return this.getValue("LOGOUT_PAGE_URL","http://www.cubeia.com");
    },
    getClientHelpUrl : function() {
        return this.getValue("CLIENT_HELP_URL","http://www.cubeia.com");
    },

    getProfilePageUrl:function() {
        return this.getValue("PROFILE_PAGE_URL", "http://www.cubeia.com");
    },

    getValue : function(param,def) {
        var value =  this.configMap.get(param);
        if(value==null) {
          console.log("Value for param " + param + " not available, returning default " + def);
          value = def;
      }
      return value;
    }
});
Poker.OperatorConfig = new Poker.OperatorConfig();