/**
 * Copyright (C) 2010 Cubeia Ltd <info@cubeia.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package com.cubeia.games.poker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.cubeia.backend.cashgame.dto.AnnounceTableFailedResponse;
import com.cubeia.backend.cashgame.dto.AnnounceTableResponse;
import com.cubeia.backend.cashgame.dto.CloseTableRequest;
import com.cubeia.backend.cashgame.dto.OpenSessionFailedResponse;
import com.cubeia.backend.cashgame.dto.OpenSessionResponse;
import com.cubeia.backend.cashgame.dto.ReserveFailedResponse;
import com.cubeia.backend.cashgame.dto.ReserveResponse;
import com.cubeia.bonus.firebase.api.BonusEventWrapper;
import com.cubeia.firebase.api.action.GameDataAction;
import com.cubeia.firebase.api.action.GameObjectAction;
import com.cubeia.firebase.api.game.GameProcessor;
import com.cubeia.firebase.api.game.TournamentProcessor;
import com.cubeia.firebase.api.game.player.GenericPlayer;
import com.cubeia.firebase.api.game.table.Table;
import com.cubeia.firebase.guice.inject.Service;
import com.cubeia.firebase.io.ProtocolObject;
import com.cubeia.firebase.io.StyxSerializer;
import com.cubeia.games.poker.cache.ActionCache;
import com.cubeia.games.poker.debugger.HandDebuggerContract;
import com.cubeia.games.poker.handler.BackendCallHandler;
import com.cubeia.games.poker.handler.PokerHandler;
import com.cubeia.games.poker.handler.Trigger;
import com.cubeia.games.poker.io.protocol.AchievementNotificationPacket;
import com.cubeia.games.poker.io.protocol.ProtocolObjectFactory;
import com.cubeia.games.poker.jmx.PokerStats;
import com.cubeia.games.poker.logic.TimeoutCache;
import com.cubeia.games.poker.state.FirebaseState;
import com.cubeia.games.poker.tournament.WaitingForTablesToFinishBeforeBreak;
import com.cubeia.games.poker.tournament.configuration.blinds.Level;
import com.cubeia.games.poker.util.ProtocolFactory;
import com.cubeia.poker.PokerState;
import com.cubeia.poker.adapter.SystemShutdownException;
import com.cubeia.poker.player.PokerPlayer;
import com.google.common.annotations.VisibleForTesting;
import com.google.inject.Inject;


/**
 * Handle incoming actions.
 *
 * @author Fredrik Johansson, Cubeia Ltd
 */
public class Processor implements GameProcessor, TournamentProcessor {

    /**
     * Serializer for poker packets
     */
    private static StyxSerializer serializer = new StyxSerializer(new ProtocolObjectFactory());

    private static Logger log = LoggerFactory.getLogger(Processor.class);

    @Inject
    @VisibleForTesting
    ActionCache actionCache;

    @Inject
    @VisibleForTesting
    StateInjector stateInjector;

    @Inject
    @VisibleForTesting
    PokerState state;

    @Inject
    @VisibleForTesting
    PokerHandler pokerHandler;

    @Inject
    @VisibleForTesting
    BackendCallHandler backendHandler;

    @Inject
    @VisibleForTesting
    TimeoutCache timeoutCache;

    @Inject
    @VisibleForTesting
    TableCloseHandlerImpl tableCloseHandler;

    @Service
    @VisibleForTesting
    HandDebuggerContract handDebugger;

    /**
     * Handles a wrapped game packet.
     */
    public void handle(GameDataAction action, Table table) {
        stateInjector.injectAdapter(table);

        try {
            ProtocolObject packet = serializer.unpack(action.getData());
            pokerHandler.setPlayerId(action.getPlayerId());
            packet.accept(pokerHandler);
            PokerStats.getInstance().setState(table.getId(), state.getStateDescription());
        } catch (Throwable t) {
            log.error("Unhandled error on table", t);
            tableCloseHandler.handleUnexpectedExceptionOnTable(action, table, t);
        }

        updatePlayerDebugInfo(table);
    }

    /**
     * Handle a wrapped object.
     *
     * <p/>
     */
    public void handle(GameObjectAction action, Table table) {
        stateInjector.injectAdapter(table);
        try {
            Object attachment = action.getAttachment();
            if (attachment instanceof Trigger) {
                Trigger command = (Trigger) attachment;
                handleCommand(table, command);
            } else if (attachment instanceof OpenSessionResponse) {
                log.debug("got open session response: {}", attachment);
                backendHandler.handleOpenSessionSuccessfulResponse((OpenSessionResponse) attachment);
            } else if (attachment instanceof OpenSessionFailedResponse) {
                log.debug("got open session failed response: {}", attachment);
                backendHandler.handleOpenSessionFailedResponse((OpenSessionFailedResponse) attachment);
            } else if (attachment instanceof ReserveResponse) {
                log.debug("got reserve response: {}", attachment);
                backendHandler.handleReserveSuccessfulResponse((ReserveResponse) attachment);
            } else if (attachment instanceof ReserveFailedResponse) {
                log.debug("got reserve failed response: {}", attachment);
                backendHandler.handleReserveFailedResponse((ReserveFailedResponse) attachment);
            } else if (attachment instanceof AnnounceTableResponse) {
                backendHandler.handleAnnounceTableSuccessfulResponse((AnnounceTableResponse) attachment);
            } else if (attachment instanceof AnnounceTableFailedResponse) {
                log.debug("got announce table failed response: {}", attachment);
                backendHandler.handleAnnounceTableFailedResponse((AnnounceTableFailedResponse) attachment);
            } else if (attachment instanceof CloseTableRequest) {
                log.debug("got close table request: {}", attachment);
                tableCloseHandler.closeTable(table, false);
            } else if (attachment instanceof WaitingForTablesToFinishBeforeBreak) {
                handleWaitingForBreak();
            } else if (attachment instanceof Level) {
                handleBlindsLevel((Level) attachment);
            } else if (attachment instanceof BonusEventWrapper) {
                handleBonusEvent((BonusEventWrapper) attachment, table);
            } else if ("CLOSE_TABLE_HINT".equals(attachment.toString())) {
                log.debug("got CLOSE_TABLE_HINT");
                tableCloseHandler.closeTable(table, false);
            } else if ("CLOSE_TABLE".equals(attachment.toString())) {
                log.debug("got CLOSE_TABLE");
                tableCloseHandler.closeTable(table, true);
            } else {
                log.warn("Unhandled object: " + attachment.getClass().getName());
            }
        } catch (SystemShutdownException t) {
            log.debug("System is shutting down, closing table " + table.getId());
            tableCloseHandler.closeTable(table, true);
        } catch (Throwable t) {
            log.error("Failed handling game object action.", t);
            tableCloseHandler.handleUnexpectedExceptionOnTable(action, table, t);
        }

        updatePlayerDebugInfo(table);
    }

    private void handleBonusEvent(BonusEventWrapper wrapper, Table table) {
    	log.warn("On Bonus Event wrapper: "+wrapper);
		int playerId = wrapper.playerId;
		int tableId = table.getId();
		
		AchievementNotificationPacket notification = new AchievementNotificationPacket();
		notification.playerId = playerId;
		notification.broadcast = wrapper.broadcast;
		notification.message = wrapper.event;
		
		ProtocolFactory factory = new ProtocolFactory();
		GameDataAction action = factory.createGameAction(notification, playerId, tableId);
		
		log.warn("Notify player["+playerId+"] at table["+tableId+"] with event ["+wrapper.event+"]");
		table.getNotifier().notifyPlayer(playerId, action);
	}

	private void handleWaitingForBreak() {
        log.debug("We are waiting for all other tables to finish and the we'll start the break.");
        // TODO: Notify players.
    }

    private void handleBlindsLevel(Level blindsLevel) {
        state.setBlindsLevels(blindsLevel.getSmallBlindAmount(), blindsLevel.getBigBlindAmount(), blindsLevel.getAnteAmount(),
                blindsLevel.isBreak(), blindsLevel.getDurationInMinutes());
    }

    private void updatePlayerDebugInfo(Table table) {
        if (handDebugger != null) {
            for (PokerPlayer player : state.getSeatedPlayers()) {
                try {
                    GenericPlayer genericPlayer = table.getPlayerSet().getPlayer(player.getId());
                    handDebugger.updatePlayerInfo(table.getId(), player.getId(),
                            genericPlayer.getName(), !player.isSittingOut(), player.getBalance(),
                            player.getBetStack());
                } catch (Exception e) {
                    log.warn("unable to fill out debug info for player: " + player.getId());
                }
            }
        }
    }

    /**
     * Basic switch and response for command types.
     *
     * @param table
     * @param command
     */
    private void handleCommand(Table table, Trigger command) {
        switch (command.getType()) {
            case TIMEOUT:
                boolean verified = pokerHandler.verifySequence(command);
                if (verified) {
                    state.timeout();
                } else {
                    log.warn("Invalid sequence detected");
                    tableCloseHandler.printActionsToErrorLog(null,
                            "Timeout command OOB: " + command + " on table: " + table,
                            table);
                }
                break;
            case PLAYER_TIMEOUT:
                handlePlayerTimeoutCommand(table, command);
                break;
        }

        PokerStats.getInstance().setState(table.getId(), state.getStateDescription());
    }

    /**
     * Verify sequence number before timeout
     *
     * @param table
     * @param command
     */
    private void handlePlayerTimeoutCommand(Table table, Trigger command) {
        if (pokerHandler.verifySequence(command)) {
            timeoutCache.removeTimeout(table.getId(), command.getPid(), table.getScheduler());
            clearRequestSequence(table);
            state.timeout();
        }
    }

    public void startRound(Table table) {
        stateInjector.injectAdapter(table);
        if (actionCache != null) {
            actionCache.clear(table.getId());
        }
        log.debug(
                "Start Hand on table: " + table + " (" + table.getPlayerSet().getPlayerCount() + ":" + state.getSeatedPlayers().size() + ")");
        state.sitOutPlayersMarkedForSitOutNextRound();
        state.scheduleTournamentHandStart();

        updatePlayerDebugInfo(table);
    }

    public void stopRound(Table table) {
        stateInjector.injectAdapter(table);
    }

    private void clearRequestSequence(Table table) {
        FirebaseState fbState = (FirebaseState) state.getAdapterState();
        fbState.setCurrentRequestSequence(-1);
    }

}
