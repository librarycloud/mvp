import bcrypt from "bcryptjs";

export interface PasswordHasher {
  compare(plainText: string, passwordHash: string): Promise<boolean>;
  hash(plainText: string): Promise<string>;
}

export class BcryptPasswordHasher implements PasswordHasher {
  compare(plainText: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainText, passwordHash);
  }

  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, 12);
  }
}
