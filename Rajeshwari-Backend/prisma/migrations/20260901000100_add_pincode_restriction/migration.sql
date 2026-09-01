CREATE TABLE "pincode_restriction" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pincode_restriction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "serviceable_pincode" (
    "id" SERIAL NOT NULL,
    "pincode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serviceable_pincode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "serviceable_pincode_pincode_key" ON "serviceable_pincode"("pincode");
