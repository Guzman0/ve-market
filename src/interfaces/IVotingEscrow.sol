// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The parts of Mezo's VotingEscrow (veBTC / veMEZO, github.com/mezo-org/tigris) that the
///         marketplace uses. Each lock is an ERC-721 token.
interface IVotingEscrow {
    struct LockedBalance {
        int128 amount;
        uint256 end;
        bool isPermanent;
    }

    enum EscrowType {
        NORMAL,
        LOCKED, // deposited into a managed NFT; cannot be transferred
        MANAGED // a managed (pooled) NFT
    }

    function locked(uint256 tokenId) external view returns (LockedBalance memory);
    function escrowType(uint256 tokenId) external view returns (EscrowType);
    function balanceOfNFT(uint256 tokenId) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}
