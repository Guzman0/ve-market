// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VeMarket} from "../src/VeMarket.sol";
import {IVotingEscrow} from "../src/interfaces/IVotingEscrow.sol";
import {MockVotingEscrow} from "./mocks/MockVotingEscrow.sol";

contract MockMUSD is ERC20Permit {
    constructor() ERC20("Mezo USD", "MUSD") ERC20Permit("Mezo USD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract VeMarketTest is Test {
    VeMarket market;
    MockMUSD musd;
    MockVotingEscrow veBTC;
    MockVotingEscrow veMEZO;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address seller = makeAddr("seller");
    uint256 buyerPk = 0xB0B;
    address buyer;
    address other = makeAddr("other");

    uint256 lockId;
    uint256 constant PRICE = 900e18;
    uint16 constant FEE_BPS = 100; // 1%
    bytes32 constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    function setUp() public {
        vm.warp(1_760_000_000);
        musd = new MockMUSD();
        veBTC = new MockVotingEscrow();
        veMEZO = new MockVotingEscrow();
        market = new VeMarket(IERC20(address(musd)), owner, treasury, FEE_BPS);
        vm.startPrank(owner);
        market.setEscrowAllowed(address(veBTC), true);
        market.setEscrowAllowed(address(veMEZO), true);
        vm.stopPrank();

        buyer = vm.addr(buyerPk);
        musd.mint(buyer, 10_000e18);
        musd.mint(other, 10_000e18);

        // 0.01 BTC locked for ~6 months
        lockId = veBTC.createLock(seller, 0.01e18, block.timestamp + 180 days, false);
    }

    // ---- helpers -----------------------------------------------------------------------------

    function _list(uint256 id, uint128 price) internal {
        vm.startPrank(seller);
        veBTC.approve(address(market), id);
        market.list(address(veBTC), id, price, 0);
        vm.stopPrank();
    }

    function _sig(uint256 pk, address holder, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH, holder, address(market), value, musd.nonces(holder), deadline
            )
        );
        (v, r, s) = vm.sign(
            pk, keccak256(abi.encodePacked("\x19\x01", musd.DOMAIN_SEPARATOR(), structHash))
        );
    }

    function _offer(address from, uint256 id, uint128 amount) internal returns (uint256 offerId) {
        vm.startPrank(from);
        musd.approve(address(market), amount);
        offerId = market.makeOffer(address(veBTC), id, amount, 0);
        vm.stopPrank();
    }

    // ---- constructor / admin -----------------------------------------------------------------

    function test_constructor_rejectsHighFee() public {
        vm.expectRevert(VeMarket.FeeTooHigh.selector);
        new VeMarket(IERC20(address(musd)), owner, treasury, 501);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(VeMarket.ZeroAddress.selector);
        new VeMarket(IERC20(address(0)), owner, treasury, 0);
        vm.expectRevert(VeMarket.ZeroAddress.selector);
        new VeMarket(IERC20(address(musd)), owner, address(0), 0);
    }

    function test_admin_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        market.setFee(0, other);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        market.setEscrowAllowed(address(veBTC), false);
    }

    function test_setFee_capped() public {
        vm.startPrank(owner);
        vm.expectRevert(VeMarket.FeeTooHigh.selector);
        market.setFee(501, treasury);
        market.setFee(500, treasury);
        vm.stopPrank();
        assertEq(market.feeBps(), 500);
    }

    // ---- listing -----------------------------------------------------------------------------

    function test_list_escrowsTheNft() public {
        _list(lockId, uint128(PRICE));
        assertEq(veBTC.ownerOf(lockId), address(market));
        VeMarket.Listing memory l = market.getListing(address(veBTC), lockId);
        assertEq(l.seller, seller);
        assertEq(l.price, PRICE);
        assertEq(l.expiresAt, 0);
    }

    function test_list_rejectsUnknownEscrow() public {
        MockVotingEscrow rogue = new MockVotingEscrow();
        uint256 id = rogue.createLock(seller, 1e18, block.timestamp + 10 days, false);
        vm.prank(seller);
        vm.expectRevert(VeMarket.EscrowNotAllowed.selector);
        market.list(address(rogue), id, 1e18, 0);
    }

    function test_list_rejectsNonOwner() public {
        vm.prank(other);
        vm.expectRevert(VeMarket.NotTokenOwner.selector);
        market.list(address(veBTC), lockId, uint128(PRICE), 0);
    }

    function test_list_rejectsManagedAndLockedNfts() public {
        veBTC.setEscrowType(lockId, IVotingEscrow.EscrowType.LOCKED);
        vm.prank(seller);
        vm.expectRevert(VeMarket.NotTransferable.selector);
        market.list(address(veBTC), lockId, uint128(PRICE), 0);

        veBTC.setEscrowType(lockId, IVotingEscrow.EscrowType.MANAGED);
        vm.prank(seller);
        vm.expectRevert(VeMarket.NotTransferable.selector);
        market.list(address(veBTC), lockId, uint128(PRICE), 0);
    }

    function test_list_rejectsZeroPriceAndPastExpiry() public {
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        vm.expectRevert(VeMarket.ZeroPrice.selector);
        market.list(address(veBTC), lockId, 0, 0);
        vm.expectRevert(VeMarket.BadExpiry.selector);
        market.list(address(veBTC), lockId, 1, uint64(block.timestamp));
        vm.stopPrank();
    }

    function test_list_withoutApprovalReverts() public {
        vm.prank(seller);
        vm.expectRevert(MockVotingEscrow.NotApprovedOrOwner.selector);
        market.list(address(veBTC), lockId, uint128(PRICE), 0);
        assertEq(market.getListing(address(veBTC), lockId).seller, address(0));
    }

    function test_escrowedLockCannotBeShrunkBySeller() public {
        _list(lockId, uint128(PRICE));
        vm.prank(seller);
        vm.expectRevert(MockVotingEscrow.NotOwner.selector);
        veBTC.shrink(lockId, 1);
    }

    function test_updateListing() public {
        _list(lockId, uint128(PRICE));
        vm.prank(seller);
        market.updateListing(address(veBTC), lockId, 800e18, uint64(block.timestamp + 1 days));
        VeMarket.Listing memory l = market.getListing(address(veBTC), lockId);
        assertEq(l.price, 800e18);

        vm.prank(other);
        vm.expectRevert(VeMarket.NotSeller.selector);
        market.updateListing(address(veBTC), lockId, 1, 0);
    }

    function test_cancelListing_returnsNft() public {
        _list(lockId, uint128(PRICE));
        vm.prank(other);
        vm.expectRevert(VeMarket.NotSeller.selector);
        market.cancelListing(address(veBTC), lockId);

        vm.prank(seller);
        market.cancelListing(address(veBTC), lockId);
        assertEq(veBTC.ownerOf(lockId), seller);
        assertEq(market.getListing(address(veBTC), lockId).seller, address(0));
    }

    function test_cancelListing_worksAfterEscrowDisallowed() public {
        _list(lockId, uint128(PRICE));
        vm.prank(owner);
        market.setEscrowAllowed(address(veBTC), false);
        vm.prank(seller);
        market.cancelListing(address(veBTC), lockId);
        assertEq(veBTC.ownerOf(lockId), seller);
    }

    // ---- buying ------------------------------------------------------------------------------

    function test_buy_paysSellerAndFee_andDeliversNft() public {
        _list(lockId, uint128(PRICE));
        vm.startPrank(buyer);
        musd.approve(address(market), PRICE);
        market.buy(address(veBTC), lockId, PRICE);
        vm.stopPrank();

        assertEq(veBTC.ownerOf(lockId), buyer);
        assertEq(musd.balanceOf(seller), 891e18); // 900 - 1%
        assertEq(musd.balanceOf(treasury), 9e18);
        assertEq(musd.balanceOf(address(market)), 0);
        assertEq(market.getListing(address(veBTC), lockId).seller, address(0));
    }

    function test_buy_withZeroFee() public {
        vm.prank(owner);
        market.setFee(0, treasury);
        _list(lockId, uint128(PRICE));
        vm.startPrank(buyer);
        musd.approve(address(market), PRICE);
        market.buy(address(veBTC), lockId, PRICE);
        vm.stopPrank();
        assertEq(musd.balanceOf(seller), PRICE);
        assertEq(musd.balanceOf(treasury), 0);
    }

    function test_buy_respectsMaxPrice() public {
        _list(lockId, uint128(PRICE));
        vm.prank(seller);
        market.updateListing(address(veBTC), lockId, 2_000e18, 0); // seller front-runs a raise
        vm.startPrank(buyer);
        musd.approve(address(market), 10_000e18);
        vm.expectRevert(abi.encodeWithSelector(VeMarket.PriceTooHigh.selector, 2_000e18, PRICE));
        market.buy(address(veBTC), lockId, PRICE);
        vm.stopPrank();
    }

    function test_buy_expiredListingReverts() public {
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        market.list(address(veBTC), lockId, uint128(PRICE), uint64(block.timestamp + 1 days));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        vm.startPrank(buyer);
        musd.approve(address(market), PRICE);
        vm.expectRevert(VeMarket.ListingExpired.selector);
        market.buy(address(veBTC), lockId, PRICE);
        vm.stopPrank();
    }

    function test_buy_notListedReverts() public {
        vm.prank(buyer);
        vm.expectRevert(VeMarket.NotListed.selector);
        market.buy(address(veBTC), lockId, PRICE);
    }

    function test_buy_ownListingReverts() public {
        _list(lockId, uint128(PRICE));
        vm.prank(seller);
        vm.expectRevert(VeMarket.CannotBuyOwnListing.selector);
        market.buy(address(veBTC), lockId, PRICE);
    }

    function test_buy_blockedWhenEscrowDisallowed() public {
        _list(lockId, uint128(PRICE));
        vm.prank(owner);
        market.setEscrowAllowed(address(veBTC), false);
        vm.startPrank(buyer);
        musd.approve(address(market), PRICE);
        vm.expectRevert(VeMarket.EscrowNotAllowed.selector);
        market.buy(address(veBTC), lockId, PRICE);
        vm.stopPrank();
    }

    function test_buy_withoutEnoughMusdReverts_andKeepsListing() public {
        _list(lockId, uint128(PRICE));
        address poor = makeAddr("poor");
        musd.mint(poor, 10e18);
        vm.startPrank(poor);
        musd.approve(address(market), PRICE);
        vm.expectRevert();
        market.buy(address(veBTC), lockId, PRICE);
        vm.stopPrank();
        assertEq(market.getListing(address(veBTC), lockId).seller, seller);
        assertEq(veBTC.ownerOf(lockId), address(market));
    }

    function test_buyWithPermit_oneSignature() public {
        _list(lockId, uint128(PRICE));
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sig(buyerPk, buyer, PRICE, deadline);
        vm.prank(buyer);
        market.buyWithPermit(address(veBTC), lockId, PRICE, deadline, v, r, s);
        assertEq(veBTC.ownerOf(lockId), buyer);
        assertEq(musd.allowance(buyer, address(market)), 0);
    }

    function test_buyWithPermit_survivesFrontRunPermit() public {
        _list(lockId, uint128(PRICE));
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sig(buyerPk, buyer, PRICE, deadline);
        musd.permit(buyer, address(market), PRICE, deadline, v, r, s); // someone submits it first
        vm.prank(buyer);
        market.buyWithPermit(address(veBTC), lockId, PRICE, deadline, v, r, s);
        assertEq(veBTC.ownerOf(lockId), buyer);
    }

    function test_marketsForBothEscrowsAreIndependent() public {
        uint256 mezoLock = veMEZO.createLock(seller, 5_000e18, block.timestamp + 365 days, false);
        uint256 btcLock2 = lockId;
        assertEq(mezoLock, btcLock2, "same token id in two escrows");

        vm.startPrank(seller);
        veMEZO.approve(address(market), mezoLock);
        market.list(address(veMEZO), mezoLock, 300e18, 0);
        vm.stopPrank();
        assertEq(market.getListing(address(veBTC), btcLock2).seller, address(0));

        vm.startPrank(buyer);
        musd.approve(address(market), 300e18);
        market.buy(address(veMEZO), mezoLock, 300e18);
        vm.stopPrank();
        assertEq(veMEZO.ownerOf(mezoLock), buyer);
        assertEq(veBTC.ownerOf(btcLock2), seller);
    }

    // ---- offers ------------------------------------------------------------------------------

    function test_makeOffer_escrowsMusd() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        assertEq(id, 1);
        assertEq(musd.balanceOf(address(market)), 700e18);
        VeMarket.Offer memory o = market.getOffer(id);
        assertEq(o.buyer, buyer);
        assertEq(o.amount, 700e18);
        assertTrue(o.active);
        assertEq(o.minLockAmount, 0.01e18);
        assertEq(o.minLockEnd, block.timestamp + 180 days);
    }

    function test_makeOffer_onMissingLockReverts() public {
        vm.startPrank(buyer);
        musd.approve(address(market), 1e18);
        vm.expectRevert(VeMarket.NotTransferable.selector);
        market.makeOffer(address(veBTC), 999, 1e18, 0);
        vm.stopPrank();
    }

    function test_acceptOffer_fromWallet() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        market.acceptOffer(id);
        vm.stopPrank();

        assertEq(veBTC.ownerOf(lockId), buyer);
        assertEq(musd.balanceOf(seller), 693e18);
        assertEq(musd.balanceOf(treasury), 7e18);
        assertEq(musd.balanceOf(address(market)), 0);
        assertFalse(market.getOffer(id).active);
    }

    function test_acceptOffer_whileListed_clearsListing() public {
        _list(lockId, uint128(PRICE));
        uint256 id = _offer(buyer, lockId, 800e18);
        vm.prank(seller);
        market.acceptOffer(id);
        assertEq(veBTC.ownerOf(lockId), buyer);
        assertEq(market.getListing(address(veBTC), lockId).seller, address(0));
        assertEq(musd.balanceOf(seller), 792e18);
    }

    function test_acceptOffer_rejectsShrunkLock() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        vm.startPrank(seller);
        veBTC.shrink(lockId, 0.001e18); // seller splits most of the BTC out first
        veBTC.approve(address(market), lockId);
        vm.expectRevert(VeMarket.LockChanged.selector);
        market.acceptOffer(id);
        vm.stopPrank();
    }

    function test_acceptOffer_rejectsShortenedLock() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        veBTC.setLockEnd(lockId, block.timestamp + 1 days);
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        vm.expectRevert(VeMarket.LockChanged.selector);
        market.acceptOffer(id);
        vm.stopPrank();
    }

    function test_acceptOffer_permanentLockIgnoresEnd() public {
        uint256 perm = veBTC.createLock(seller, 1e18, 0, true);
        uint256 id = _offer(buyer, perm, 50_000e18 / 10);
        vm.startPrank(seller);
        veBTC.approve(address(market), perm);
        market.acceptOffer(id);
        vm.stopPrank();
        assertEq(veBTC.ownerOf(perm), buyer);
    }

    function test_acceptOffer_onlyOwner() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        vm.prank(other);
        vm.expectRevert(VeMarket.NotTokenOwner.selector);
        market.acceptOffer(id);
    }

    function test_acceptOffer_someoneElsesListingReverts() public {
        _list(lockId, uint128(PRICE));
        uint256 id = _offer(buyer, lockId, 700e18);
        vm.prank(other);
        vm.expectRevert(VeMarket.NotTokenOwner.selector);
        market.acceptOffer(id);
    }

    function test_acceptOffer_expiredReverts() public {
        vm.startPrank(buyer);
        musd.approve(address(market), 700e18);
        uint256 id =
            market.makeOffer(address(veBTC), lockId, 700e18, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        vm.expectRevert(VeMarket.OfferExpired.selector);
        market.acceptOffer(id);
        vm.stopPrank();
    }

    function test_acceptOffer_lockedNftReverts() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        veBTC.setEscrowType(lockId, IVotingEscrow.EscrowType.LOCKED);
        vm.prank(seller);
        vm.expectRevert(VeMarket.NotTransferable.selector);
        market.acceptOffer(id);
    }

    function test_acceptOffer_cannotAcceptOwnOffer() public {
        uint256 id = _offer(seller == buyer ? other : buyer, lockId, 700e18);
        // buyer acquires the lock, then tries to accept their own offer
        vm.prank(seller);
        veBTC.transferFrom(seller, buyer, lockId);
        vm.startPrank(buyer);
        veBTC.approve(address(market), lockId);
        vm.expectRevert(VeMarket.CannotBuyOwnListing.selector);
        market.acceptOffer(id);
        vm.stopPrank();
    }

    function test_acceptOffer_twiceReverts() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        market.acceptOffer(id);
        vm.expectRevert(VeMarket.OfferNotActive.selector);
        market.acceptOffer(id);
        vm.stopPrank();
    }

    function test_cancelOffer_refunds() public {
        uint256 id = _offer(buyer, lockId, 700e18);
        vm.prank(other);
        vm.expectRevert(VeMarket.NotOfferBuyer.selector);
        market.cancelOffer(id);

        vm.prank(buyer);
        market.cancelOffer(id);
        assertEq(musd.balanceOf(buyer), 10_000e18);
        assertEq(musd.balanceOf(address(market)), 0);

        vm.prank(buyer);
        vm.expectRevert(VeMarket.OfferNotActive.selector);
        market.cancelOffer(id);
    }

    function test_cancelOffer_worksAfterExpiryAndDisallow() public {
        vm.startPrank(buyer);
        musd.approve(address(market), 700e18);
        uint256 id =
            market.makeOffer(address(veBTC), lockId, 700e18, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        vm.warp(block.timestamp + 5 days);
        vm.prank(owner);
        market.setEscrowAllowed(address(veBTC), false);
        vm.prank(buyer);
        market.cancelOffer(id);
        assertEq(musd.balanceOf(buyer), 10_000e18);
    }

    function test_manyOffers_onlyAcceptedOneIsPaidOut() public {
        uint256 a = _offer(buyer, lockId, 600e18);
        uint256 b = _offer(other, lockId, 650e18);
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        market.acceptOffer(b);
        vm.stopPrank();
        assertEq(veBTC.ownerOf(lockId), other);
        assertEq(musd.balanceOf(address(market)), 600e18, "losing offer still escrowed");
        vm.prank(buyer);
        market.cancelOffer(a);
        assertEq(musd.balanceOf(address(market)), 0);
    }

    function test_makeOfferWithPermit() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sig(buyerPk, buyer, 500e18, deadline);
        vm.prank(buyer);
        uint256 id =
            market.makeOfferWithPermit(address(veBTC), lockId, 500e18, 0, deadline, v, r, s);
        assertEq(market.getOffer(id).amount, 500e18);
        assertEq(musd.balanceOf(address(market)), 500e18);
    }

    // ---- fuzz --------------------------------------------------------------------------------

    function testFuzz_saleConservesMusd(uint128 price, uint16 feeBps) public {
        price = uint128(bound(price, 1, 1_000_000e18));
        feeBps = uint16(bound(feeBps, 0, 500));
        vm.prank(owner);
        market.setFee(feeBps, treasury);

        _list(lockId, price);
        musd.mint(buyer, price);
        uint256 before = musd.balanceOf(buyer);
        vm.startPrank(buyer);
        musd.approve(address(market), price);
        market.buy(address(veBTC), lockId, price);
        vm.stopPrank();

        uint256 fee = uint256(price) * feeBps / 10_000;
        assertEq(before - musd.balanceOf(buyer), price);
        assertEq(musd.balanceOf(seller), price - fee);
        assertEq(musd.balanceOf(treasury), fee);
        assertEq(musd.balanceOf(address(market)), 0);
    }

    function testFuzz_offerAcceptConservesMusd(uint128 amount, uint16 feeBps) public {
        amount = uint128(bound(amount, 1, 9_000e18));
        feeBps = uint16(bound(feeBps, 0, 500));
        vm.prank(owner);
        market.setFee(feeBps, treasury);
        uint256 id = _offer(buyer, lockId, amount);
        vm.startPrank(seller);
        veBTC.approve(address(market), lockId);
        market.acceptOffer(id);
        vm.stopPrank();
        uint256 fee = uint256(amount) * feeBps / 10_000;
        assertEq(musd.balanceOf(seller) + musd.balanceOf(treasury), amount);
        assertEq(musd.balanceOf(treasury), fee);
        assertEq(musd.balanceOf(address(market)), 0);
    }
}
