import { ethers } from "hardhat";
import deployment from "../frontend/lib/deployment.json";

async function main() {
  const c = await ethers.getContractAt("NeuroLedger", deployment.contractAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = Number(await (c as any).getAgentCount());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentList = await (c as any).agentList;

  console.log(`\nContract: ${deployment.contractAddress}`);
  console.log(`Registered agents: ${count}`);
  console.log(`─`.repeat(60));

  // Read AgentRegistered events to get all registered addresses + names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = await (c as any).queryFilter((c as any).filters.AgentRegistered());
  for (const log of logs) {
    const e = log as ethers.EventLog;
    const addr = e.args.agent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await (c as any).agents(addr);
    console.log(`  #${agent.agentTokenId} — ${agent.hospitalName}`);
    console.log(`     Address:    ${addr}`);
    console.log(`     Region:     ${agent.region}`);
    console.log(`     Reputation: ${agent.reputation}`);
    console.log(`     Accept bps: ${agent.acceptThresholdBps}  Retrain bps: ${agent.retrainThresholdBps}`);
    console.log(`     Explorer: https://chainscan-galileo.0g.ai/address/${addr}`);
    console.log();
  }
}

main().catch(console.error);
