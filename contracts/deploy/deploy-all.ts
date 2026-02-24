import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const operators = (process.env.PUSC_OPERATORS || "")
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);

  for (const op of operators) {
    if (!hre.ethers.isAddress(op)) {
      throw new Error(`Invalid address in PUSC_OPERATORS: ${op}`);
    }
  }

  console.log("Deploying contracts with:", deployer.address);
  console.log("Network:", hre.network.name, "Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "EGAS\n");

  // 1. Deploy PUSC implementation + ERC1967 proxy
  console.log("\n--- Deploying PUSC ---");
  const PUSC = await hre.ethers.getContractFactory("PUSC");
  const puscImpl = await PUSC.deploy();
  await puscImpl.waitForDeployment();
  const puscImplAddr = await puscImpl.getAddress();
  console.log("PUSC implementation deployed to:", puscImplAddr);

  const PUSCProxy = await hre.ethers.getContractFactory("PUSCProxy");
  const initData = PUSC.interface.encodeFunctionData("initialize", [operators]);
  const puscProxy = await PUSCProxy.deploy(puscImplAddr, initData);
  await puscProxy.waitForDeployment();
  const puscAddr = await puscProxy.getAddress();
  console.log("PUSC proxy deployed to:", puscAddr);
  console.log("PUSC operators:", operators.length > 0 ? operators.join(", ") : "(none)");

  const pusc = await hre.ethers.getContractAt("PUSC", puscAddr);
  const puscOwner = await pusc.owner();
  console.log("PUSC owner:", puscOwner);

  // Summary
  console.log("\n========== DEPLOYMENT SUMMARY ==========");
  console.log(`PUSC implementation:   ${puscImplAddr}`);
  console.log(`PUSC proxy (token):    ${puscAddr}`);
  console.log("=========================================");
  console.log("\nUpdate config/tokens.ts: pusd=<PUSC proxy address>");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
