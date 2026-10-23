// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVotingEscrow} from "./interfaces/IVotingEscrow.sol";

/// @title VeMarket — buy and sell locked veBTC / veMEZO positions for MUSD
/// @notice Mezo locks (veBTC, veMEZO) are NFTs that cannot be withdrawn before they unlock. This
///         market lets a holder sell the whole position for MUSD instead of waiting.
///
///         Listings: the seller deposits the NFT here, so the position cannot be split, merged or
///         withdrawn while a buyer is looking at it. The seller can cancel at any time.
///         Offers:   a buyer escrows MUSD for a specific position. The offer records the minimum
///                   lock amount and unlock date the buyer saw, and is only accepted if the
///                   position still meets them.
///
///         The owner can only set the fee (capped at 5%), the fee recipient and which escrow
///         contracts are accepted. The owner can never move listed NFTs or escrowed MUSD.
contract VeMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 500; // 5%
    uint16 private constant BPS = 10_000;

    struct Listing {
        address seller;
        uint64 expiresAt; // 0 = never expires
        uint128 price; // MUSD, 18 decimals
    }

    struct Offer {
        address buyer;
        address escrow;
        uint256 tokenId;
        uint128 amount; // MUSD held by this contract
        uint64 expiresAt; // 0 = never expires
        bool active;
        uint128 minLockAmount; // lock must still hold at least this much when accepted
        uint64 minLockEnd; // and unlock no earlier than this (ignored if the lock is permanent)
    }

    IERC20 public immutable musd;
    address public feeRecipient;
    uint16 public feeBps;
    mapping(address escrow => bool) public isAllowedEscrow;

    mapping(address escrow => mapping(uint256 tokenId => Listing)) private _listings;
    mapping(uint256 offerId => Offer) private _offers;
    uint256 public offerCount;

    event EscrowAllowed(address indexed escrow, bool allowed);
    event FeeUpdated(uint16 feeBps, address feeRecipient);
    event Listed(
        address indexed escrow,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        uint64 expiresAt,
        int128 lockAmount,
        uint256 lockEnd,
        bool isPermanent
    );
    event PriceUpdated(
        address indexed escrow, uint256 indexed tokenId, uint256 price, uint64 expiresAt
    );
    event Delisted(address indexed escrow, uint256 indexed tokenId, address indexed seller);
    event Sold(
        address indexed escrow,
        uint256 indexed tokenId,
        address seller,
        address indexed buyer,
        uint256 price,
        uint256 fee,
        uint256 offerId // 0 when bought from a listing
    );
    event OfferMade(
        uint256 indexed offerId,
        address indexed escrow,
        uint256 indexed tokenId,
        address buyer,
        uint256 amount,
        uint64 expiresAt
    );
    event OfferCancelled(uint256 indexed offerId);

    error EscrowNotAllowed();
    error NotTransferable();
    error NotTokenOwner();
    error ZeroPrice();
    error BadExpiry();
    error NotListed();
    error NotSeller();
    error ListingExpired();
    error PriceTooHigh(uint256 price, uint256 maxPrice);
    error FeeTooHigh();
    error ZeroAddress();
    error OfferNotActive();
    error OfferExpired();
    error NotOfferBuyer();
    error LockChanged();
    error CannotBuyOwnListing();

    constructor(IERC20 musd_, address owner_, address feeRecipient_, uint16 feeBps_)
        Ownable(owner_)
    {
        if (address(musd_) == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        musd = musd_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }

    // =========================================================================================
    // Admin
    // =========================================================================================

    function setEscrowAllowed(address escrow, bool allowed) external onlyOwner {
        if (escrow == address(0)) revert ZeroAddress();
        isAllowedEscrow[escrow] = allowed;
        emit EscrowAllowed(escrow, allowed);
    }

    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }

    // =========================================================================================
    // Listings
    // =========================================================================================

    /// @notice List a lock for sale. The NFT moves into this contract until sold or cancelled.
    ///         Approve this contract for the NFT first.
    function list(address escrow, uint256 tokenId, uint128 price, uint64 expiresAt)
        external
        nonReentrant
    {
        if (!isAllowedEscrow[escrow]) revert EscrowNotAllowed();
        if (price == 0) revert ZeroPrice();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert BadExpiry();
        IVotingEscrow ve = IVotingEscrow(escrow);
        if (ve.escrowType(tokenId) != IVotingEscrow.EscrowType.NORMAL) revert NotTransferable();
        if (ve.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        _listings[escrow][tokenId] =
            Listing({seller: msg.sender, expiresAt: expiresAt, price: price});

        IVotingEscrow.LockedBalance memory lock = ve.locked(tokenId);
        emit Listed(
            escrow, tokenId, msg.sender, price, expiresAt, lock.amount, lock.end, lock.isPermanent
        );

        ve.transferFrom(msg.sender, address(this), tokenId);
    }

    function updateListing(address escrow, uint256 tokenId, uint128 price, uint64 expiresAt)
        external
    {
        Listing storage l = _listings[escrow][tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.seller != msg.sender) revert NotSeller();
        if (price == 0) revert ZeroPrice();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert BadExpiry();
        l.price = price;
        l.expiresAt = expiresAt;
        emit PriceUpdated(escrow, tokenId, price, expiresAt);
    }

    /// @notice Cancel a listing and get the NFT back. Works even after the listing expired and
    ///         even if the escrow was later removed from the allow-list.
    function cancelListing(address escrow, uint256 tokenId) external nonReentrant {
        Listing memory l = _listings[escrow][tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.seller != msg.sender) revert NotSeller();
        delete _listings[escrow][tokenId];
        emit Delisted(escrow, tokenId, msg.sender);
        IVotingEscrow(escrow).transferFrom(address(this), msg.sender, tokenId);
    }

    /// @notice Buy a listed lock. `maxPrice` protects against the seller raising the price
    ///         while your transaction is pending.
    function buy(address escrow, uint256 tokenId, uint256 maxPrice) external nonReentrant {
        _buy(escrow, tokenId, maxPrice);
    }

    /// @notice Buy with a single MUSD permit signature instead of a separate approval.
    function buyWithPermit(
        address escrow,
        uint256 tokenId,
        uint256 maxPrice,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _permit(maxPrice, permitDeadline, v, r, s);
        _buy(escrow, tokenId, maxPrice);
    }

    function _buy(address escrow, uint256 tokenId, uint256 maxPrice) private {
        Listing memory l = _listings[escrow][tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.seller == msg.sender) revert CannotBuyOwnListing();
        if (l.expiresAt != 0 && block.timestamp > l.expiresAt) revert ListingExpired();
        if (l.price > maxPrice) revert PriceTooHigh(l.price, maxPrice);
        if (!isAllowedEscrow[escrow]) revert EscrowNotAllowed();

        delete _listings[escrow][tokenId];
        uint256 fee = _fee(l.price);
        emit Sold(escrow, tokenId, l.seller, msg.sender, l.price, fee, 0);

        musd.safeTransferFrom(msg.sender, l.seller, l.price - fee);
        if (fee != 0) musd.safeTransferFrom(msg.sender, feeRecipient, fee);
        IVotingEscrow(escrow).transferFrom(address(this), msg.sender, tokenId);
    }

    // =========================================================================================
    // Offers
    // =========================================================================================

    /// @notice Offer MUSD for a specific lock. The MUSD is held by this contract until the offer
    ///         is accepted or cancelled. The offer remembers the lock's current size and unlock
    ///         date, and can only be accepted if the lock has not shrunk or been shortened.
    function makeOffer(address escrow, uint256 tokenId, uint128 amount, uint64 expiresAt)
        external
        nonReentrant
        returns (uint256 offerId)
    {
        offerId = _makeOffer(escrow, tokenId, amount, expiresAt);
    }

    function makeOfferWithPermit(
        address escrow,
        uint256 tokenId,
        uint128 amount,
        uint64 expiresAt,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 offerId) {
        _permit(amount, permitDeadline, v, r, s);
        offerId = _makeOffer(escrow, tokenId, amount, expiresAt);
    }

    function _makeOffer(address escrow, uint256 tokenId, uint128 amount, uint64 expiresAt)
        private
        returns (uint256 offerId)
    {
        if (!isAllowedEscrow[escrow]) revert EscrowNotAllowed();
        if (amount == 0) revert ZeroPrice();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert BadExpiry();
        IVotingEscrow.LockedBalance memory lock = IVotingEscrow(escrow).locked(tokenId);
        if (lock.amount <= 0) revert NotTransferable(); // no such lock, or already withdrawn

        offerId = ++offerCount;
        _offers[offerId] = Offer({
            buyer: msg.sender,
            escrow: escrow,
            tokenId: tokenId,
            amount: amount,
            expiresAt: expiresAt,
            active: true,
            minLockAmount: uint128(lock.amount),
            minLockEnd: uint64(lock.end)
        });
        emit OfferMade(offerId, escrow, tokenId, msg.sender, amount, expiresAt);

        musd.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw your offer and get your MUSD back. Works at any time, including after it
    ///         expired.
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage o = _offers[offerId];
        if (!o.active) revert OfferNotActive();
        if (o.buyer != msg.sender) revert NotOfferBuyer();
        o.active = false;
        uint256 amount = o.amount;
        emit OfferCancelled(offerId);
        musd.safeTransfer(msg.sender, amount);
    }

    /// @notice Accept an offer on a lock you own. Works whether the lock is in your wallet
    ///         (approve this contract first) or currently listed here by you.
    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage o = _offers[offerId];
        if (!o.active) revert OfferNotActive();
        if (o.expiresAt != 0 && block.timestamp > o.expiresAt) revert OfferExpired();
        if (!isAllowedEscrow[o.escrow]) revert EscrowNotAllowed();
        if (o.buyer == msg.sender) revert CannotBuyOwnListing();
        _checkLockUnchanged(o);

        // Where is the NFT? Either listed here by the caller, or in the caller's wallet.
        bool listedHere = _listings[o.escrow][o.tokenId].seller == msg.sender;
        if (listedHere) {
            delete _listings[o.escrow][o.tokenId];
            emit Delisted(o.escrow, o.tokenId, msg.sender);
        } else {
            _checkWalletOwnership(IVotingEscrow(o.escrow), o.tokenId);
        }

        o.active = false;
        uint256 fee = _fee(o.amount);
        emit Sold(o.escrow, o.tokenId, msg.sender, o.buyer, o.amount, fee, offerId);

        IVotingEscrow(o.escrow)
            .transferFrom(listedHere ? address(this) : msg.sender, o.buyer, o.tokenId);
        musd.safeTransfer(msg.sender, o.amount - fee);
        if (fee != 0) musd.safeTransfer(feeRecipient, fee);
    }

    function _checkLockUnchanged(Offer storage o) private view {
        IVotingEscrow.LockedBalance memory lock = IVotingEscrow(o.escrow).locked(o.tokenId);
        if (lock.amount < int128(o.minLockAmount)) revert LockChanged();
        if (!lock.isPermanent && lock.end < o.minLockEnd) revert LockChanged();
    }

    function _checkWalletOwnership(IVotingEscrow ve, uint256 tokenId) private view {
        if (ve.escrowType(tokenId) != IVotingEscrow.EscrowType.NORMAL) revert NotTransferable();
        if (ve.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
    }

    // =========================================================================================
    // Views
    // =========================================================================================

    function getListing(address escrow, uint256 tokenId) external view returns (Listing memory) {
        return _listings[escrow][tokenId];
    }

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return _offers[offerId];
    }

    // =========================================================================================
    // Internal
    // =========================================================================================

    function _fee(uint256 amount) private view returns (uint256) {
        return amount * feeBps / BPS;
    }

    /// @dev Ignore a failing permit (e.g. it was front-run); the transfer below still requires a
    ///      sufficient allowance.
    function _permit(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) private {
        try IERC20Permit(address(musd))
            .permit(msg.sender, address(this), value, deadline, v, r, s) {}
            catch {}
    }
}
