const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const isMainnet = chainId === 16661;
  const isGalileo = chainId === 16602;

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  NeuroLedger — Deploying to ${isMainnet ? "0G Mainnet" : isGalileo ? "0G Galileo Testnet" : "Hardhat"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "A0GI\n");

  if (balance < ethers.parseEther("0.05")) {
    console.warn("⚠️  Low balance. Get testnet tokens: https://faucet.0g.ai/");
  }

  console.log("📋 Deploying NeuroLedger.sol...");
  const NeuroLedger = await ethers.getContractFactory("NeuroLedger");
  const neuroLedger = await NeuroLedger.deploy();
  await neuroLedger.waitForDeployment();

  const contractAddress = await neuroLedger.getAddress();
  const deployTx = neuroLedger.deploymentTransaction();

  console.log("✅ NeuroLedger deployed at:", contractAddress);
  console.log("   Owner:", await neuroLedger.owner());
  console.log("   Aggregator:", await neuroLedger.aggregator());

  const explorerBase = isMainnet
    ? "https://chainscan.0g.ai"
    : isGalileo
    ? "https://chainscan-galileo.0g.ai"
    : "";

  if (deployTx?.hash && explorerBase) {
    console.log("   TX Hash:", deployTx.hash);
    console.log(`   Explorer: ${explorerBase}/tx/${deployTx.hash}`);
  }

  // Fund contract for rewards (keep 0.5 OG for gas on mainnet, 0.05 on testnet)
  const fundAmount = isMainnet ? "0.1" : "0.05";
  console.log(`\n💰 Funding contract for rewards (${fundAmount} OG)...`);
  const fundTx = await deployer.sendTransaction({
    to: contractAddress,
    value: ethers.parseEther(fundAmount),
  });
  await fundTx.wait();
  console.log("   Contract balance:", ethers.formatEther(await ethers.provider.getBalance(contractAddress)), "OG");

  // Save deployment info for frontend
  const networkName = isMainnet ? "mainnet" : isGalileo ? "galileo" : "hardhat";

  const deployment = {
    contractAddress,
    deployTxHash: deployTx?.hash ?? "",
    deployerAddress: deployer.address,
    network: networkName,
    chainId,
    explorerUrl: explorerBase ? `${explorerBase}/address/${contractAddress}` : "",
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../frontend/lib/deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("\n📁 Deployment saved to frontend/lib/deployment.json");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Deployment Complete");
  console.log("  Contract Address:", contractAddress);
  if (explorerBase) {
    console.log(`  Explorer: ${explorerBase}/address/${contractAddress}`);
  }
  console.log("═══════════════════════════════════════════════════════════");

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

module.exports = { main };
