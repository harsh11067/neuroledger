import { ethers } from "hardhat";
import deployment from "../frontend/lib/deployment.json";

async function main() {
  const c = await ethers.getContractAt("NeuroLedger", deployment.contractAddress);
  const events = [
    "AgentRegistered", "RoundStarted", "GradientSubmitted",
    "AggregationComplete", "AgentDecision", "AccuracyReported",
    "RewardDistributed", "GovernanceTrigger",
  ];

  console.log(`\nContract: ${deployment.contractAddress}`);
  console.log(`Network:  ${deployment.network} (chain ${deployment.chainId})`);
  console.log(`─`.repeat(60));

  for (const name of events) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await (c as any).queryFilter((c as any).filters[name]());
    console.log(`${name.padEnd(22)} ${logs.length} events`);
    if (logs.length > 0) {
      const last = logs[logs.length - 1] as ethers.EventLog;
      console.log(`  Latest: https://chainscan-galileo.0g.ai/tx/${last.transactionHash}`);
    }
  }
}

main().catch(console.error);
