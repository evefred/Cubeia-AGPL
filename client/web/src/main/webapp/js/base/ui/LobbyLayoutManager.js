"use strict";
var Poker = Poker || {};
Poker.LobbyLayoutManager = Class.extend({

    /**
     * @type Poker.TemplateManager
     */
    templateManager : null,
    cashGameFilters: null,
    tournamentFilters: null,
    sitAndGoFilters : null,
    requiredFilters : null,
    filtersEnabled : true,
    state : null,
    topMenu : null,

    cashGameSortingFunction : null,
    sitAndGoSortingFunction : null,

    tournamentListSettings : {
        prefix : "tournamentItem",
        listTemplateId : "tournamentLobbyListTemplate",
        listItemTemplateId : "tournamentListItemTemplate"

    },
    sitAndGoListSettings : {
        prefix : "sitAndGoItem",
        listTemplateId : "sitAndGoLobbyListTemplate",
        listItemTemplateId : "sitAndGoListItemTemplate"
    },
    tableListSettings : {
        prefix : "tableItem",
        listTemplateId : "tableLobbyListTemplate",
        listItemTemplateId : "tableListItemTemplate"
    },

    init : function() {
        this.templateManager = Poker.AppCtx.getTemplateManager();
        this.cashGameFilters = [];
        this.tournamentFilters = [];
        this.sitAndGoFilters = [];
        this.requiredFilters = [];

        var self = this;

        var variantMenu = new Poker.BasicMenu(".navbar-variant");
        variantMenu.addItem("#variantTexas",function(){
            new Poker.LobbyRequestHandler().subscribeToCashGames("texas");
        });
        variantMenu.addItem("#variantTelesina",function(){
            new Poker.LobbyRequestHandler().subscribeToCashGames("telesina");
        });

        variantMenu.addItem("#variantCrazyPineapple",function(){
            new Poker.LobbyRequestHandler().subscribeToCashGames("crazyp");
        });

        variantMenu.activateItem("#variantTexas");

        this.topMenu = new Poker.BasicMenu(".navbar-top");
        this.topMenu.addItem("#cashGameMenu", function(){
            self.state = Poker.LobbyLayoutManager.CASH_STATE;
            variantMenu.activateItem("#variantTexas");
            new Poker.LobbyRequestHandler().subscribeToCashGames("texas");
            $.ga._trackEvent("user_navigation", "click_cashGameMenu");
        });

        this.topMenu.addItem("#sitAndGoMenu",function (e) {
            self.state = Poker.LobbyLayoutManager.SIT_AND_GO_STATE;
            variantMenu.hide();
            new Poker.LobbyRequestHandler().subscribeToSitAndGos();
            $.ga._trackEvent("user_navigation", "click_sitAndGoMenu");
        });
        this.topMenu.addItem("#tournamentMenu",function (e) {
            self.state = Poker.LobbyLayoutManager.TOURNAMENT_STATE;
            variantMenu.hide();
            new Poker.LobbyRequestHandler().subscribeToTournaments();
            $.ga._trackEvent("user_navigation", "click_tournamentMenu");
        });

        $(".show-filters").touchSafeClick(function () {
            $(this).toggleClass("selected");
            $(".table-filter").toggleClass("hidden");
        });

        this.initFilters();
    },
    setCashGameSortingFunction : function(func) {
        this.cashGameSortingFunction = func;
    },
    setSitAndGoSortingFunction : function(func) {
        this.sitAndGoSortingFunction = func;
    },
    onLogin : function() {
        this.updateIFrameUrl("#lobbyRightPromotionsIframe",Poker.OperatorConfig.getLobbyRightPromotionUrl());
        this.updateIFrameUrl("#lobbyTopPromotionsIframe",Poker.OperatorConfig.getLobbyTopPromotionUrl());
        this.addCurrencyFilters();
        this.topMenu.selectItem("#cashGameMenu");

    },
    updateIFrameUrl : function(iframe,url) {
        var iframe = $(iframe);
        if(url!=null && $.trim(url).length>0) {
            iframe.show();
            iframe.attr("src",url);
        } else {
            iframe.hide();
        }
    },
    addCurrencyFilters : function() {
        var currencies = Poker.OperatorConfig.getEnabledCurrencies();
        if(currencies.length>1) {
            $("#currencyMenu .currency").remove();
            $(".filter-group.currencies").show();
            var t = this.templateManager.getRenderTemplate("currencyFilterTemplate");
            for(var i = 0; i<currencies.length; i++) {
                $("#currencyMenu").append(t.render(currencies[i]));
            }
            var currencyFilter = new Poker.RadioGroupFilter(currencies, this,["currencyCode","buyInCurrencyCode"],"filterButton","code");
            this.requiredFilters.push(currencyFilter);
        } else {
            $(".filter-group.currencies").hide();
        }
    },
    filterUpdated : function() {
        if(this.state == Poker.LobbyLayoutManager.SIT_AND_GO_STATE) {
            var filteredTournaments = Poker.AppCtx.getLobbyManager().sitAndGoLobbyData.getFilteredItems();
            this.createSitAndGoList(filteredTournaments);
        } else if(this.state == Poker.LobbyLayoutManager.TOURNAMENT_STATE) {
            var filteredTournaments = Poker.AppCtx.getLobbyManager().tournamentLobbyData.getFilteredItems();
            this.createTournamentList(filteredTournaments);
        } else {
            var filteredCashGames = Poker.AppCtx.getLobbyManager().cashGamesLobbyData.getFilteredItems();
            this.createTableList(filteredCashGames);
        }
    },
    initFilters:function () {
        this.initCashGameFilters();
        this.initTournamentFilters();

    },
    initCashGameFilters: function() {
         var fullTablesFilter = new Poker.LobbyFilter("hideFullTables", false,
                 function(enabled, lobbyData) {
                     if (enabled) {
                         return lobbyData.seated < lobbyData.capacity;
                     } else {
                         return true;
                     }
                 }, this);
         this.cashGameFilters.push(fullTablesFilter);
         var emptyTablesFilter = new Poker.LobbyFilter("hideEmptyTables", false,
                 function(enabled, lobbyData) {
                     if (enabled) {
                         return lobbyData.seated > 0;
                     } else {
                         return true;
                     }

                 }, this);

         this.cashGameFilters.push(emptyTablesFilter);

         var items = [
              { id : "NL", name: "No Limit"},
              { id : "PL", name: "Pot Limit"},
              { id : "FL", name: "Fixed Limit"}
          ];
         var limitFilters = new Poker.RadioGroupFilter(items, this,["type"],"limits");
         this.cashGameFilters.push(limitFilters);

         var highStakes = new Poker.PropertyMinMaxFilter("highStakes", true, this, "smallBlind", 10, -1);

         this.cashGameFilters.push(highStakes);

         var mediumStakes = new Poker.PropertyMinMaxFilter("mediumStakes", true, this, "smallBlind", 5, 9.99);
         this.cashGameFilters.push(mediumStakes);

         var lowStakes = new Poker.PropertyMinMaxFilter("lowStakes", true, this, "smallBlind", -1, 4.9);
         this.cashGameFilters.push(lowStakes);

         this.sitAndGoFilters.push(limitFilters);
         this.sitAndGoFilters.push(new Poker.PrivateTournamentFilter());

         var registeringOnly = new Poker.EqualsFilter("registeringOnly",true,this,"status","REGISTERING");
         this.sitAndGoFilters.push(registeringOnly);
         this.tournamentFilters.push(registeringOnly);
    },

    initTournamentFilters : function () {
        this.tournamentFilters.push(new Poker.PrivateTournamentFilter());
    },
    isAllowedByFilters : function (data, filters) {
        for (var i = 0; i < filters.length; i++) {
            var filter = filters[i];
            if (filter.filter(data) == false) {
                return false;
            }
        }
        for (var i = 0; i < this.requiredFilters.length; i++) {
            var filter = this.requiredFilters[i];
            if (filter.filter(data) == false) {
                return false;
            }
        }

        return true;
    },
    sortAttribute : null,
    sortAscending : false,
    createTableList : function(tables) {
        this.state = Poker.LobbyLayoutManager.CASH_STATE;
        this.filtersEnabled = true;
        $(".sitandgo-filter").hide();
        $(".tournament-filter").hide();
        $(".cashgame-filter").show();
        this.createLobbyList(tables,this.tableListSettings, this.getTableItemCallback(), this.cashGameFilters);
        var self = this;

        var sortElement = $("#lobbyView ." +  this.sortAttribute + "-sort");
        if(this.sortAscending==true) {
            sortElement.addClass("sorting-asc");
        } else {
            sortElement.addClass("sorting-desc");
        }
        $("#lobbyView .name-sort").click(function(e){
            self.cashGameSortingFunction("name",!$(this).hasClass("sorting-asc"));
        });
        $("#lobbyView .blinds-sort").click(function(e){
            self.cashGameSortingFunction("blinds",!$(this).hasClass("sorting-asc"));
        });
        $("#lobbyView  .capacity-sort").click(function(e){
            self.cashGameSortingFunction("capacity",!$(this).hasClass("sorting-asc"));
        });
    },

    setCurrentSorting : function(attribute,asc) {
        this.sortAttribute = attribute;
        this.sortAscending = asc;
    },
    createTournamentList : function(tournaments) {
        this.state = Poker.LobbyLayoutManager.TOURNAMENT_STATE;
        $(".cashgame-filter").hide();
        $(".sitandgo-filter").hide();
        $(".tournament-filter").show();
        this.createLobbyList(tournaments,this.tournamentListSettings, this.getTournamentItemCallback(), this.tournamentFilters);
    },
    createSitAndGoList : function(sitAndGos) {
        this.state = Poker.LobbyLayoutManager.SIT_AND_GO_STATE;
        this.filtersEnabled = true;
        $(".tournament-filter").hide();
        $(".cashgame-filter").hide();
        $(".sitandgo-filter").show();
        this.createLobbyList(sitAndGos, this.sitAndGoListSettings, this.getTournamentItemCallback(), this.sitAndGoFilters);

        var self = this;
        var sortElement = $("#lobbyView ." +  this.sortAttribute + "-sort");
        if(this.sortAscending==true) {
            sortElement.addClass("sorting-asc");
        } else {
            sortElement.addClass("sorting-desc");
        }
        $("#lobbyView .buy-in-sort").click(function(e){
            self.sitAndGoSortingFunction("buy-in",!$(this).hasClass("sorting-asc"));
        });
        $("#lobbyView  .capacity-sort").click(function(e){
            self.sitAndGoSortingFunction("capacity",!$(this).hasClass("sorting-asc"));
        });
    },
    getTableItemCallback : function() {
        var self = this;
        return function(listItem){
            new Poker.TableRequestHandler(listItem.id).openTableWithName(
                listItem.capacity,self.getTableDescription(listItem));
        };
    },
    getTournamentItemCallback  : function() {
        return function(listItem){
            var tournamentManager = Poker.AppCtx.getTournamentManager();
            tournamentManager.createTournament(listItem.id,listItem.name);
        };
    },
    getTableDescription : function(data) {
        return Poker.ProtocolUtils.getTableName(data);
    },
    tableRemoved : function(tableId) {
       this.removeListItem("tableItem",tableId);
    },
    tournamentRemoved : function(tournamentId) {
        this.removeListItem("tournamentItem",tournamentId);
    },
    removeListItem : function(prefix,id) {
        console.log("REMOVING LIST ITEM WITH ID " + id);
        $("#" + prefix + id).remove();
    },
    updateListItem : function(settings, listItem, callbackFunction) {
        var self = this;
        var item = $("#" + settings.prefix + listItem.id);
        console.log(item);
        console.log("UPDATING ITEM : ");
        console.log(listItem);
        if (item.length > 0) {

            item.unbind().replaceWith(this.getTableItemHtml(settings.listItemTemplateId,listItem));
            var item = $("#" + settings.prefix + listItem.id);  //need to pick it up again to be able to bind to it
            item.touchSafeClick(function(){
                callbackFunction(listItem);
            });
        }
        console.log("update complete");
    },
    updateTableItem : function(listItem) {
        this.updateListItem(this.tableListSettings,listItem,this.getTableItemCallback());
    },

    updateTournamentItem : function(listItem) {
        this.updateListItem(this.tournamentListSettings,listItem,this.getTournamentItemCallback());
    },
    updateSitAndGoItem : function(listItem) {
        this.updateListItem(this.sitAndGoListSettings,listItem,this.getTournamentItemCallback());
    },
    createLobbyList : function(listItems, settings, listItemCallback, filters) {
        $('#lobby').show();

        var container = $("#tableListContainer");
        container.empty();

        var template = this.templateManager.getRenderTemplate(settings.listTemplateId);

        $("#tableListContainer").html(template.render({}));

        var listContainer =  container.find(".table-list-item-container");

        var self = this;
        var count = 0;
        $.each(listItems, function (i, item) {
            if(self.isAllowedByFilters(item, filters)) {
                count++;
                if (typeof(item.tableStatus)!="undefined") {
                    item.tableStatus = Poker.ProtocolUtils.getTableStatus(item.seated,item.capacity);
                }
                var html = self.getTableItemHtml(settings.listItemTemplateId, item);
                listContainer.append(html);
                $("#" + settings.prefix + item.id).touchSafeClick(function(){
                    listItemCallback(item);
                });
            }


        });
        if (count == 0) {
            listContainer.append($("<div/>").addClass("no-tables").html("Currently no tables matching your criteria"));
        }
    },
    getTableItemHtml : function (templateId, data) {
        var item = this.templateManager.render(templateId, data);
        return item;
    }
});
Poker.LobbyLayoutManager.CASH_STATE = 1;
Poker.LobbyLayoutManager.TOURNAMENT_STATE = 2;
Poker.LobbyLayoutManager.SIT_AND_GO_STATE = 3;
