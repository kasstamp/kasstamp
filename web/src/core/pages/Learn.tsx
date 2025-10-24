import { FaqItem } from '@/shared/components/ui/Faq';
import { UseCaseBlock } from '@/shared/components/ui/UseCaseBlock';

export default function LearnPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-3 py-8 sm:px-6">
      <div className="grid gap-2 text-center">
        <h1 className="font-semibold">Learn</h1>
        <p className="text-gray-600">Clear answers. No jargon.</p>
      </div>

      <div className="box w-full min-w-0">
        <div className="grid w-full min-w-0 gap-2">
          <FaqItem question="What is KasStamp and what does it do?" defaultOpen>
            <p>
              KasStamp provides a portable, neutral proof that a specific digital file existed at a
              certain point in time, and that it remains unchanged when others verify it.
            </p>
          </FaqItem>

          <FaqItem question="What do I get when I use KasStamp?">
            <p>
              You receive a human-readable receipt along with references to the public record
              (transaction IDs, block times, and explorer links). Anyone can verify your proof
              directly from the public data, no need to trust us.
            </p>
          </FaqItem>

          <FaqItem question="What’s the difference between Public and Private proofs?">
            <p>
              <strong>Public:</strong> The digital artifact and its proof are visible to everyone.
              Anyone can view and verify it directly on the network.
              <br />
              <strong>Private:</strong> Only you (or your wallet) can access or reveal the proof. It
              stays hidden unless you choose to share it.
            </p>
          </FaqItem>

          <FaqItem question="What happens if I lose my receipt?">
            <p>
              Without a receipt, verifying your proof becomes much harder. Always save it securely,
              and consider backing it up to the cloud.
            </p>
          </FaqItem>

          <FaqItem question="Can anyone see my file?">
            <p>Only if you choose “Public.” In all other modes, the file remains private.</p>
          </FaqItem>

          <FaqItem question="What does the proof mean, and what doesn’t it mean?">
            <p>
              <strong>It means:</strong> This exact file existed no later than the time recorded on
              the BlockDAG. While block timestamps themselves are approximate, the block’s{' '}
              <em>blue score</em> gives a precise position in the network’s history. That means you
              can prove the file existed before that point with strong certainty.
            </p>
            <p className="mt-2">
              <strong>It does not mean:</strong> You are the author or owner of the content, that
              the content is true, or that we will host it forever.
            </p>
          </FaqItem>

          <FaqItem question="How reliable is availability and archival access?">
            <p>
              Public networks are robust, but different node operators store different amounts of
              historical data. Today, archival access is widely available because many services
              depend on it. Over the long term, discoverability may vary, but your receipt is
              designed to help others locate and verify records.
            </p>
          </FaqItem>

          <FaqItem question="How secure and private is my data?">
            <p>
              Changing even a single byte of the file breaks the proof. In private modes, the
              contents are encrypted and can only be accessed with your keys. You control what is
              disclosed, you are responsible for storing the receipts, and, where applicable, you
              manage the encryption keys.
            </p>
          </FaqItem>

          <FaqItem question="Who uses KasStamp?">
            <p>
              KasStamp is used across many fields, including creative and cultural work, scientific
              research, legal and administrative records, personal and community archives, software
              releases, and operational state tracking.
            </p>
          </FaqItem>

          <FaqItem question="How can I verify a file later?">
            <p>
              Re-create the proof by uploading your receipt. In public mode, anyone can access
              public receipts. In private mode, only the wallet keys used to create the proof can
              reconstruct and verify the file.
            </p>
          </FaqItem>

          <FaqItem question="What is Kaspa?">
            <p>
              Kaspa is a Proof-of-Work cryptocurrency designed for speed and security. Instead of a
              single-chain blockchain, it uses a BlockDAG, which allows multiple blocks to be
              produced in parallel and then consistently ordered. The result: confirmations in
              seconds, high throughput, and a simple, open network.
            </p>
          </FaqItem>

          <FaqItem question="What is a BlockDAG?">
            <p>
              A BlockDAG (Directed Acyclic Graph) doesn’t force blocks into a single chain. It
              enables parallel block production. Kaspa’s GHOSTDAG/Kettu protocol then orders
              competing blocks consistently, without reducing Proof-of-Work security. This provides:
            </p>
            <ul className="mt-2 list-disc pl-5">
              <li>Faster confirmations (a finality-like experience in seconds)</li>
              <li>Higher throughput through parallel blocks</li>
              <li>Better resilience to latency and temporary forks</li>
            </ul>
            <p className="mt-2">
              Compared to Bitcoin’s linear blockchain (~10 minutes per block), a BlockDAG scales
              more naturally with bandwidth and latency, while preserving Proof-of-Work security.
            </p>
          </FaqItem>
        </div>
      </div>

      <UseCaseBlock />
    </div>
  );
}
