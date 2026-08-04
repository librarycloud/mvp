declare module "sm-crypto" {
  const smCrypto: {
    sm2: {
    doSignature(data: string, privateKey: string, options: { hash: boolean; userId: string }): string;
    doVerifySignature(data: string, signature: string, publicKey: string, options: { hash: boolean; userId: string }): boolean;
    };
    sm4: {
    encrypt(data: string, key: string, options: { iv: string; mode: "cbc"; output: "array" }): number[];
    decrypt(data: string, key: string, options: { iv: string; mode: "cbc" }): string;
    };
  };
  export default smCrypto;
}
