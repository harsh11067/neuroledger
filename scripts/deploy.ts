const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  NeuroLedger — Deploying to 0G Newton Testnet");
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

  if (deployTx?.hash) {
    console.log("   TX Hash:", deployTx.hash);
    const network = await ethers.provider.getNetwork();
    if (Number(network.chainId) === 16602) {
      console.log("   Explorer: https://chainscan-galileo.0g.ai/tx/" + deployTx.hash);
    }
  }

  // Set Aggregator if provided in .env
  const teeProvider = process.env.TEE_PROVIDER_ADDRESS;
  if (teeProvider && ethers.isAddress(teeProvider)) {
    console.log(`\n⚙️  Setting aggregator to: ${teeProvider}`);
    const setAggTx = await neuroLedger.setAggregator(teeProvider);
    await setAggTx.wait();
    console.log("   Aggregator updated.");
  }

  // Fund contract for rewards
  console.log("\n💰 Funding contract for rewards (0.05 A0GI)...");
  const fundTx = await deployer.sendTransaction({
    to: contractAddress,
    value: ethers.parseEther("0.05"),
  });
  await fundTx.wait();
  console.log("   Contract balance:", ethers.formatEther(await ethers.provider.getBalance(contractAddress)), "A0GI");

  // Save deployment info for frontend
  const network = await ethers.provider.getNetwork();
  const isNewton = Number(network.chainId) === 16602;

  const deployment = {
    contractAddress,
    deployTxHash: deployTx?.hash ?? "",
    deployerAddress: deployer.address,
    network: isNewton ? "galileo" : "hardhat",
    chainId: Number(network.chainId),
    explorerUrl: isNewton ? `https://chainscan-galileo.0g.ai/address/${contractAddress}` : "",
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../frontend/lib/deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("\n📁 Deployment saved to frontend/lib/deployment.json");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Deployment Complete");
  console.log("  Contract Address:", contractAddress);
  if (isNewton) {
    console.log("  Explorer: https://chainscan-galileo.0g.ai/address/" + contractAddress);
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
