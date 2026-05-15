import { ethers } from "hardhat";
import deployment from "../frontend/lib/deployment.json";

async function main() {
  const c = await ethers.getContractAt("NeuroLedger", deployment.contractAddress);
  const currentRound = await c.currentRound();
  console.log(`Current Round: ${currentRound}`);

  for (let i = 1; i <= 6; i++) {
    const info = await c.getRoundInfo(i);
    console.log(`\nRound ${i}:`);
    console.log(`  Start Time: ${new Date(Number(info[0]) * 1000).toLocaleString()}`);
    console.log(`  End Time: ${info[1] === 0n ? 'Active' : new Date(Number(info[1]) * 1000).toLocaleString()}`);
    console.log(`  Participants: ${info[2]}`);
    console.log(`  Aggregation Complete: ${info[3]}`);
    console.log(`  Rewards Distributed: ${info[4]}`);
    console.log(`  Governance Triggered: ${info[5]}`);
    console.log(`  Model CID: ${info[6] || 'None'}`);
  }
}

main().catch(console.error);
