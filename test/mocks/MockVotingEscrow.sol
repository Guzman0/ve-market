// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVotingEscrow} from "../../src/interfaces/IVotingEscrow.sol";

/// Minimal stand-in for Mezo's VotingEscrow with the same transfer rules:
/// owner or approved can transfer, LOCKED (deposited into managed) NFTs cannot move.
contract MockVotingEscrow is IVotingEscrow {
    mapping(uint256 => address) public override ownerOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => LockedBalance) private _locked;
    mapping(uint256 => EscrowType) private _type;
    uint256 public nextId = 1;

    error NotApprovedOrOwner();
    error NotOwner();
    error NotManagedOrNormalNFT();

    function createLock(address to, int128 amount, uint256 end, bool permanent)
        external
        returns (uint256 id)
    {
        id = nextId++;
        ownerOf[id] = to;
        _locked[id] = LockedBalance(amount, end, permanent);
    }

    function setEscrowType(uint256 id, EscrowType t) external {
        _type[id] = t;
    }

    /// Simulates split(): the owner moves part of the lock out to a new NFT.
    function shrink(uint256 id, int128 newAmount) external {
        if (ownerOf[id] != msg.sender) revert NotOwner();
        _locked[id].amount = newAmount;
    }

    /// Simulates withdraw() after the lock ends.
    function withdraw(uint256 id) external {
        if (ownerOf[id] != msg.sender) revert NotOwner();
        delete _locked[id];
        delete ownerOf[id];
    }

    function setLockEnd(uint256 id, uint256 end) external {
        _locked[id].end = end;
    }

    function approve(address to, uint256 id) external {
        if (ownerOf[id] != msg.sender) revert NotOwner();
        getApproved[id] = to;
    }

    function setApprovalForAll(address op, bool ok) external {
        isApprovedForAll[msg.sender][op] = ok;
    }

    function locked(uint256 id) external view returns (LockedBalance memory) {
        return _locked[id];
    }

    function escrowType(uint256 id) external view returns (EscrowType) {
        return _type[id];
    }

    function balanceOfNFT(uint256 id) external view returns (uint256) {
        return uint256(uint128(_locked[id].amount));
    }

    function transferFrom(address from, address to, uint256 id) external {
        if (_type[id] == EscrowType.LOCKED) revert NotManagedOrNormalNFT();
        address owner = ownerOf[id];
        if (
            msg.sender != owner && getApproved[id] != msg.sender
                && !isApprovedForAll[owner][msg.sender]
        ) revert NotApprovedOrOwner();
        if (owner != from) revert NotOwner();
        delete getApproved[id];
        ownerOf[id] = to;
    }
}
