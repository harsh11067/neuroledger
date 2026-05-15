# NeuroLedger Mechanism Design

The core mechanisms of NeuroLedger ensure Byzantine-robustness, data privacy, and incentive alignment.

## 1. Byzantine-Robust Aggregation (Multi-Krum)

To protect the global model from "poisoning" attacks, NeuroLedger uses the Multi-Krum algorithm:

- **Distance Metric**: Computes the Euclidean distance between all submitted gradients.
- **Scoring**: For each gradient, it sums the distances to its $n-f-2$ nearest neighbors (where $f$ is the number of tolerated Byzantine agents).
- **Selection**: Only the gradients with the lowest scores are selected for the final average.
- **TEE Enforcement**: This logic is executed inside an Intel TDX enclave, ensuring the operator cannot manually pick which hospitals to include.

## 2. Privacy Mechanism (Rényi Differential Privacy)

NeuroLedger uses Rényi Differential Privacy (RDP) to provide a strong mathematical bound on information leakage:

- **Noise Injection**: Gaussian noise is added to the gradients scaled by the sensitivity of the loss function.
- **Privacy Budget**: The `dpEpsilonConsumed` field on-chain tracks the total privacy budget used per round.
- **Guarantee**: Even if an attacker has access to the global model, they cannot determine if a specific patient's record was used in training with high statistical confidence.

## 3. Autonomous Reputation System

Hospital agents are not just passive participants; they are autonomous auditors:

- **Local Validation**: Each agent tests the global model on its own private "hold-out" set.
- **Incentive Alignment**: Agents that contribute high-quality updates see their `reputation` increase, which directly impacts their share of the reward pool.
- **Nash Equilibrium**: Slashing (staking) and rewards create a game-theoretical environment where the most profitable strategy for a hospital is to contribute honest, high-quality data.

## 4. On-Chain Coordination

The `NeuroLedger.sol` contract manages the 8-event lifecycle:
- **Immutability**: Once a CID is posted, it cannot be changed.
- **Auditability**: Anyone can verify the TEE signatures using the public key of the 0G Compute network.
- **Transparency**: All accuracy reports and decisions are public, allowing for meta-analysis of the network's performance.
