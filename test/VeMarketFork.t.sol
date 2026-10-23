// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VeMarket} from "../src/VeMarket.sol";
import {IVotingEscrow} from "../src/interfaces/IVotingEscrow.sol";

interface IVeApprove {
    function approve(address to, uint256 tokenId) external;
}

/// Runs against Mezo's real veBTC and MUSD on testnet:
///   MEZO_RPC=https://rpc.test.mezo.org forge test --match-contract VeMarketForkTest -vv
contract VeMarketForkTest is Test {
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant VEBTC = 0xB63fcCd03521Cf21907627bd7fA465C129479231;
    address constant VEMEZO = 0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b;

    VeMarket market;
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("MEZO_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
        market = new VeMarket(IERC20(MUSD), address(this), makeAddr("treasury"), 100);
        market.setEscrowAllowed(VEBTC, true);
        market.setEscrowAllowed(VEMEZO, true);
    }

    /// Finds a real, transferable veBTC lock on testnet.
    function _findLock(address escrow) internal view returns (uint256 id, address owner) {
        IVotingEscrow ve = IVotingEscrow(escrow);
        for (uint256 i = 1; i < 400; ++i) {
            try ve.ownerOf(i) returns (address o) {
                if (o == address(0) || o.code.length != 0) continue;
                if (ve.escrowType(i) != IVotingEscrow.EscrowType.NORMAL) continue;
                if (ve.locked(i).amount <= 0) continue;
                return (i, o);
            } catch {}
        }
        revert("no lock found");
    }

    /// The contract actually deployed for the buildathon, not a fresh copy.
    address constant DEPLOYED_MARKET = 0xD55eC26d45dbE88b9Da2C476E2Cb96eC36A2e989;

    function test_fork_deployedMarketSellsRealVeMEZO() public {
        if (!forked) return;
        market = VeMarket(DEPLOYED_MARKET);
        assertTrue(market.isAllowedEscrow(VEMEZO));
        assertTrue(market.isAllowedEscrow(VEBTC));
        _listAndBuy(VEMEZO);
    }

    function test_fork_listAndBuyRealVeBTC() public {
        _listAndBuy(VEBTC);
    }

    function test_fork_listAndBuyRealVeMEZO() public {
        _listAndBuy(VEMEZO);
    }

    function test_fork_offerOnRealVeMEZO() public {
        if (!forked) return;
        (uint256 id, address seller) = _findLock(VEMEZO);
        address buyer = makeAddr("bidder");
        deal(MUSD, buyer, 500e18);
        vm.startPrank(buyer);
        IERC20(MUSD).approve(address(market), 500e18);
        uint256 offerId = market.makeOffer(VEMEZO, id, 500e18, 0);
        vm.stopPrank();
        vm.startPrank(seller);
        IVeApprove(VEMEZO).approve(address(market), id);
        market.acceptOffer(offerId);
        vm.stopPrank();
        assertEq(IVotingEscrow(VEMEZO).ownerOf(id), buyer);
    }

    function _listAndBuy(address VEBTC_) internal {
        if (!forked) return;
        address VEBTC = VEBTC_;
        (uint256 id, address seller) = _findLock(VEBTC);
        IVotingEscrow.LockedBalance memory lock = IVotingEscrow(VEBTC).locked(id);
        console.log("lock id", id);
        console.log("locked BTC (wei)", uint256(uint128(lock.amount)));
        console.log("unlocks at", lock.end);

        vm.startPrank(seller);
        IVeApprove(VEBTC).approve(address(market), id);
        market.list(VEBTC, id, 100e18, 0);
        vm.stopPrank();
        assertEq(IVotingEscrow(VEBTC).ownerOf(id), address(market));

        address buyer = makeAddr("buyer");
        deal(MUSD, buyer, 100e18);
        vm.startPrank(buyer);
        IERC20(MUSD).approve(address(market), 100e18);
        market.buy(VEBTC, id, 100e18);
        vm.stopPrank();

        assertEq(IVotingEscrow(VEBTC).ownerOf(id), buyer);
        assertEq(IERC20(MUSD).balanceOf(seller) >= 99e18, true);
    }
}
