package com.cubeia.games.poker.tournament;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Random;
import java.util.Set;

import junit.framework.TestCase;

import org.apache.log4j.Logger;

import com.cubeia.firebase.api.action.GameAction;
import com.cubeia.firebase.api.action.SeatPlayersMttAction;
import com.cubeia.firebase.api.action.mtt.MttAction;
import com.cubeia.firebase.api.action.mtt.MttRoundReportAction;
import com.cubeia.firebase.api.common.Attribute;
import com.cubeia.firebase.api.mtt.MttNotifier;
import com.cubeia.firebase.api.mtt.model.MttPlayer;
import com.cubeia.firebase.api.mtt.model.MttRegistrationRequest;
import com.cubeia.firebase.api.mtt.support.MTTStateSupport;
import com.cubeia.firebase.api.mtt.support.MttNotifierAdapter;
import com.cubeia.games.poker.tournament.activator.PokerTournamentCreationParticipant;
import com.cubeia.games.poker.tournament.state.PokerTournamentState;
import com.cubeia.games.poker.tournament.state.PokerTournamentStatus;

/**
 * Tests a poker tournament. 
 * 
 * Testing check list:
 * 1. Register a player, check that he is registered.
 * 2. Register enough players for the tournament to start, check that it starts.
 * 3. Send a round report indicating that two players are out, check that they are removed from the tournament.
 * 4. Send another round report and check that table balancing occurs. 
 * 5. Check that the blinds are increased when a timeout is triggered.
 * 6. Check that the tournament finishes when there is only one player left.
 *
 */
public class PokerTournamentTest extends TestCase {
	
	private static final Logger log = Logger.getLogger(PokerTournamentTest.class);
	
	PokerTournament tournament;
	
	MTTStateSupport state;
	
	MttInstanceAdapter instance;
	
	PokerTournamentState pokerState;
	
	Random rng = new Random();
	
	@Override
	protected void setUp() throws Exception {
		super.setUp();
		tournament = new PokerTournament();		
		state = new MTTStateSupport(1, 1);
		instance = new MttInstanceAdapter();
		instance.setState(state);
		instance.setScheduler(new MockScheduler());
		tournament.setTableCreator(new MockTableCreator(tournament, instance));
		tournament.setMttNotifier(new MttNotifierAdapter());
		
		PokerTournamentCreationParticipant part = new PokerTournamentCreationParticipant("test", 20);
		part.tournamentCreated(state, instance.getLobbyAccessor());
		pokerState = (PokerTournamentState) state.getState();
	}
	
	public void testRegister() {
		registerPlayer(1);
	}
	
	public void testSitAndGo() {
		assertEquals(PokerTournamentStatus.REGISTERING.name(), 
				instance.getLobbyAccessor().getStringAttribute(PokerTournamentLobbyAttributes.STATUS.name()));
		assertEquals(20, state.getMinPlayers());
		fillTournament();
		assertEquals(PokerTournamentStatus.RUNNING.name(), 
				instance.getLobbyAccessor().getStringAttribute(PokerTournamentLobbyAttributes.STATUS.name()));
		assertEquals(2, state.getTables().size());
		assertEquals(10, state.getPlayersAtTable(0).size());
	}

	public void testPlayerOut() {
		fillTournament();
		int remaining = state.getRemainingPlayerCount();
		simulatePlayersOut(1, state.getPlayersAtTable(1).iterator().next());
		assertEquals(remaining - 1, state.getRemainingPlayerCount());
	}
	
	public void testBalanceTables() {
		fillTournament();
		forceBalancing();
	}

	private void forceBalancing() {
		int remaining = state.getRemainingPlayerCount();
		Collection<Integer> playersAtTable = state.getPlayersAtTable(0);
		Iterator<Integer> iterator = playersAtTable.iterator();
		simulatePlayersOut(0, iterator.next(), iterator.next());
		assertEquals(remaining - 2, state.getRemainingPlayerCount());
		
		// Another table finishes a hand.
		int playersAtTableTwo = state.getPlayersAtTable(1).size();
		sendRoundReport(1, new PokerTournamentRoundReport());
		assertEquals(playersAtTableTwo - 1, state.getPlayersAtTable(1).size());
	}
	
	public void testStartingBalance() {
		fillTournament();
		assertEquals(Long.valueOf(100000), pokerState.getPlayerBalance(1));
	}
	
	public void testBalanceAfterMove() {
		fillTournament();
		tournament.setMttNotifier(new MttNotifier() {

			public void notifyPlayer(int playerId, MttAction action) {
				
			}

			public void notifyTable(int tableId, GameAction action) {
				log.debug("Received action: " + action);
				if (action instanceof SeatPlayersMttAction) {
					SeatPlayersMttAction seat = (SeatPlayersMttAction) action;
					assertEquals(Long.valueOf(100000), seat.getPlayers().iterator().next().getPlayerData());
				}
			}
			
		});
		forceBalancing();
	}
	
	public void testStartToEnd() {
		fillTournament();
		
		int i = 0;
		while (pokerState.getStatus() != PokerTournamentStatus.FINISHED) {
			int randomTableId = getRandomTableId(state.getTables());
			
			if (randomTableId != -1) {
				sendRoundReport(randomTableId, createRoundReport(randomTableId));
			}
			if (i++ > 1000) {
				fail("Tournament should have been finished by now.");
			}
		}
	}

	private PokerTournamentRoundReport createRoundReport(int tableId) {
		PokerTournamentRoundReport report = new PokerTournamentRoundReport();
		Collection<Integer> playersAtTable = state.getPlayersAtTable(tableId);
		int playersInTournament = state.getRemainingPlayerCount();
		
		for (Integer playerId : playersAtTable) {
			// Check so we dont kick all players out
			long randomBalance = getRandomBalance();
			if (randomBalance <= 0 && --playersInTournament == 0) {
				randomBalance = 1000; // Last player
			}
			report.setBalance(playerId, randomBalance);
		}
		
		return report;
	}

	private long getRandomBalance() {
		boolean out = rng.nextInt(100) < 40;
		if (out) {
			return 0;
		} else {
			return rng.nextInt(1000);
		}
	}

	private int getRandomTableId(Set<Integer> tables) {
		List<Integer> list = new ArrayList<Integer>(tables);
		if (list.size() > 0) {
			return list.get(new Random().nextInt(list.size()));
		}
		return -1;
	}

	private void simulatePlayersOut(int tableId, int ...playerIds) {
		sendRoundReport(tableId, createPlayersOutRoundReport(playerIds));
	}

	private void sendRoundReport(int tableId, PokerTournamentRoundReport report) {
		MttRoundReportAction action = new MttRoundReportAction(1, tableId);
		action.setAttachment(report);
		tournament.process(action, instance);	
	}

	private PokerTournamentRoundReport createPlayersOutRoundReport(int ... playerIds) {
		PokerTournamentRoundReport roundReport = new PokerTournamentRoundReport();
		for (int playerId : playerIds) {
			roundReport.setBalance(playerId, 0);
		}
		return roundReport;
	}
	
	private void fillTournament() {
		for (int i = 0; i < state.getMinPlayers(); i++) {
			registerPlayer(i);
		}
	}

	private void registerPlayer(int playerId) {
		MttPlayer player = new MttPlayer(playerId);
		MttRegistrationRequest request = new MttRegistrationRequest(player, new ArrayList<Attribute>());
		int before = state.getRegisteredPlayersCount();
		state.getPlayerRegistry().register(instance, request);
		tournament.getPlayerListener(state).playerRegistered(instance, request);
		assertEquals(before + 1, state.getRegisteredPlayersCount());
	}
}
