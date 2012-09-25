var Poker = Poker || {};

Poker.CommunicationHandler = Poker.AbstractConnectorHandler.extend({
    webSocketUrl : null,
    webSocketPort : null,
    tableComManager : null,
    lobbyLayoutManager : null,
    init : function(webSocketUrl, webSocketPort) {
        this.webSocketUrl = webSocketUrl;
        this.webSocketPort = webSocketPort;

        var self = this;
        this.lobbyLayoutManager = new Poker.LobbyLayoutManager();
        this.connect();


    },
    showConnectStatus : function(text) {
      $(".connect-status").html(text);
    },
    openTable : function(tableId, capacity){
        console.log("CommunicationHandler.openTable");
        $("#lobbyView").hide();
        $("#tableView").show();
        this.tableComManager = new Poker.TableComHandler(this.connector);
        this.tableComManager.onOpenTable(tableId, capacity);
    },
    packetCallback : function(protocolObject){
        this.tableComManager.handlePacket(protocolObject);

    },
    lobbyCallback : function(protocolObject) {
        console.log(protocolObject);
        switch (protocolObject.classId) {
            // Table snapshot list

            case FB_PROTOCOL.TableSnapshotListPacket.CLASSID :
                this.lobbyLayoutManager.handleTableSnapshotList(protocolObject.snapshots);
                break;
            case FB_PROTOCOL.TableUpdateListPacket.CLASSID :
                this.lobbyLayoutManager.handleTableUpdateList(protocolObject.updates);
                break;
            case FB_PROTOCOL.TableRemovedPacket.CLASSID :
                this.lobbyLayoutManager.handleTableRemoved(protocolObject.tableid);
                break;
            case FB_PROTOCOL.TournamentSnapshotListPacket.CLASSID :
                console.log(protocolObject);
                this.lobbyLayoutManager.handleTournamentSnapshotList(protocolObject.snapshots);
                break;
            case FB_PROTOCOL.TournamentUpdateListPacket.CLASSID :
                this.lobbyLayoutManager.handleTournamentUpdates(protocolObject.updates);
                break;
        }
    },
    watchTable : function(tableId) {
        console.log("WATCHING TABLE = " + tableId);
        this.connector.watchTable(tableId);
    },
    loginCallback : function(status,playerId,name) {
        if (status == "OK") {
            Poker.MyPlayer.onLogin(playerId,name);
            $("#username").html(name);
            $("#userId").html(playerId);
            $('#loginView').hide();
            $("#lobbyView").show();
            document.location.hash="#";
            this.subscribeToCashGames();
        }
    },
    retryCount : 0,
    statusCallback : function(status) {
        console.log("Status recevied: " + status);
        //CONNECTING:1,CONNECTED:2,DISCONNECTED:3,RECONNECTING:4,RECONNECTED:5,FAIL:6,CANCELLED:7

        if (status === FIREBASE.ConnectionStatus.CONNECTED) {
            this.retryCount = 0;
            this.showConnectStatus("Connected");
            this.lobbyLayoutManager.showLogin();
        } else if (status === FIREBASE.ConnectionStatus.DISCONNECTED) {
            this.retryCount++;
            this.showConnectStatus("Disconnected, retrying (count " +this.retryCount+")");
            var self = this;
            setTimeout(function(){
                self.connect();
            },500);
        } else if(status === FIREBASE.ConnectionStatus.CONNECTING){
            this.showConnectStatus("Connecting");
        }
    },
    connect : function () {
        var self = this;
        this.showConnectStatus("Initializing");
        this.connector = new FIREBASE.Connector(
            function(po) { self.tableComManager.handlePacket(po) },
            function(po){self.lobbyCallback(po);},
            function(status, playerId, name){self.loginCallback(status,playerId,name);},
            function(status){self.statusCallback(status);});

        this.connector.connect("FIREBASE.WebSocketAdapter", this.webSocketUrl, this.webSocketPort, "socket");
        this.tableComManager = new Poker.TableComHandler(this.connector);
    },
    doLogin : function(username,password) {
        this.connector.login(username, password, 0);
    },

    subscribeToCashGames : function() {
        this.lobbyLayoutManager.createGrid();
        this.connector.lobbySubscribe(1, "/");
    },

    subscribeToSitAndGos : function() {
        this.subscribeToTournamentsWithPath("/sitandgo")
    },

    subscribeToTournaments : function() {
        this.subscribeToTournamentsWithPath("/scheduled");
    },

    subscribeToTournamentsWithPath : function(path) {
        this.lobbyLayoutManager.clearLobby();
        this.lobbyLayoutManager.createGrid();
        console.log("Subscribing to tournaments with path " + path);
        var subscribeRequest = new FB_PROTOCOL.LobbySubscribePacket();
        subscribeRequest.type = FB_PROTOCOL.LobbyTypeEnum.MTT;
        subscribeRequest.gameid = 1;
        subscribeRequest.address = path;
        this.connector.sendProtocolObject(subscribeRequest)
    }

});

