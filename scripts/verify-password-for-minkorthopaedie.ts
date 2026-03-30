import bcrypt from "bcryptjs";
import { prisma } from "../db";

const TARGET_EMAIL = "info@mink-orthopaedie.de";
const TEST_PASSWORD = "123456";

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: TARGET_EMAIL, mode: "insensitive" },
    },
    select: {
      id: true,
      email: true,
      password: true,
      secretPassword: true,
    },
  });

  if (!user) {
    console.log("0");
    return;
  }

  const passwordOk = user.password
    ? await bcrypt.compare(TEST_PASSWORD, user.password)
    : false;
  const secretPasswordOk = user.secretPassword
    ? await bcrypt.compare(TEST_PASSWORD, user.secretPassword)
    : false;

  const ok = passwordOk && secretPasswordOk;

  console.log(
    JSON.stringify(
      {
        success: ok,
        email: user.email,
        passwordMatches: passwordOk,
        secretPasswordMatches: secretPasswordOk,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[verify-password-for-minkorthopaedie] Failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
