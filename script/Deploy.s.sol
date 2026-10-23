// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VeMarket} from "../src/VeMarket.sol";

/// Deploys VeMarket on Mezo testnet and allows veBTC (and veMEZO if VEMEZO_ADDRESS is set).
///   forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast --private-key $KEY
contract Deploy is Script {
    // From github.com/mezo-org/musd and github.com/mezo-org/tigris testnet deployments.
    address constant MUSD_TESTNET = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant VEBTC_TESTNET = 0xB63fcCd03521Cf21907627bd7fA465C129479231;

    function run() external returns (VeMarket market) {
        address deployer = msg.sender;
        address treasury = vm.envOr("TREASURY", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(100))); // 1%
        address veMezo = vm.envOr("VEMEZO_ADDRESS", address(0));

        vm.startBroadcast();
        market = new VeMarket(IERC20(MUSD_TESTNET), deployer, treasury, feeBps);
        market.setEscrowAllowed(VEBTC_TESTNET, true);
        if (veMezo != address(0)) market.setEscrowAllowed(veMezo, true);
        vm.stopBroadcast();

        console.log("VeMarket", address(market));
        console.log("veBTC allowed", VEBTC_TESTNET);
        if (veMezo != address(0)) console.log("veMEZO allowed", veMezo);
    }
}
