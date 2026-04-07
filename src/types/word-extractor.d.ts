declare module "word-extractor" {
  class WordExtractor {
    extract(input: string | Buffer): Promise<{
      getBody(): string;
    }>;
  }
  export default WordExtractor;
}
