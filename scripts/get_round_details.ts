import { ethers } from "hardhat";
import deployment from "../frontend/lib/deployment.json";

async function main() {
  const c = await ethers.getContractAt("NeuroLedger", deployment.contractAddress);
  const roundId = 21;

  console.log(`\nRound ${roundId} Verification Data:`);

  const gradients = await c.queryFilter(c.filters.GradientSubmitted(roundId));
  console.log(`Gradients found: ${gradients.length}`);
  const cids = [];
  for (const g of gradients) {
    const log = g as any;
    console.log(`  Agent: ${log.args.agent}  CID: ${log.args.cid}`);
    cids.push(log.args.cid);
  }

  const aggregations = await c.queryFilter(c.filters.AggregationComplete(roundId));
  if (aggregations.length > 0) {
    const log = aggregations[0] as any;
    console.log(`\nAggregation Found:`);
    console.log(`  Hash: ${log.args.aggregationHash}`);
    console.log(`  Model CID: ${log.args.globalModelCID}`);
    console.log(`  CIDs for reproduction: ${cids.join(',')}`);
    console.log(`\nCommand: python scripts/verify_aggregation.py --cids ${cids.join(',')} --expected ${log.args.aggregationHash}`);
  } else {
    console.log(`\nNo AggregationComplete event found for Round ${roundId}.`);
  }
}

main().catch(console.error);
