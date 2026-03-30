import bcrypt from "bcryptjs";
import { prisma } from "../db";

const TARGET_EMAIL = "info@mink-orthopaedie.de";

async function main() {
  const plainPassword = "123456";

  const user = await prisma.user.findFirst({
    where: {
      email: { contains: TARGET_EMAIL},
    },
    select: { id: true, email: true },
  });

  if (!user) {
    console.log("0");
    return;
  }

  const hashed = await bcrypt.hash(plainPassword, 8);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      secretPassword: hashed,
    },
  });

  console.log(`Password updated successfully for ${TARGET_EMAIL}`);
}

main()
  .catch((error) => {
    console.error("[set-password-for-minkorthopaedie] Failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
