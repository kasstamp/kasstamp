export default function TermsPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-3 py-8 sm:px-6">
      <div className="grid gap-2">
        <h1 className="font-semibold">Terms of Service</h1>
        <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="box">
        <div className="grid gap-4 text-sm text-gray-700">
          <section>
            <h2 className="mb-2 text-lg font-medium">1. Preamble</h2>
            <p>
              These Terms of Service (“Terms”) govern the access to and use of KasStamp, a
              client-side, open-source web interface that enables users to create and interact with
              cryptographic proofs of existence and integrity of digital artifacts on the Kaspa
              blockDAG network. KasStamp is operated by Marcel Sangals and Tjark Fröse, Hamburg,
              Germany (“we”, “us”, “our”). By using KasStamp, you (“User”, “you”) acknowledge that
              you have read, understood, and agreed to these Terms. If you do not accept these
              Terms, you must not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">2. Definitions</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>“KasStamp”</strong> or <strong>“Service”</strong> refers to the software,
                website, and associated resources provided by the operators.
              </li>
              <li>
                <strong>“User”</strong> refers to any individual or legal entity accessing or using
                the Service.
              </li>
              <li>
                <strong>“Kaspa network”</strong> refers to the public, decentralized blockDAG
                blockchain known as Kaspa.
              </li>
              <li>
                <strong>“Proof”</strong> refers to the cryptographic record generated through the
                Service, demonstrating the existence and integrity of digital artifacts at a
                particular point in time.
              </li>
              <li>
                <strong>“Content”</strong> refers to any data, files, information, or material the
                User interacts with when using the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">3. Scope and Applicability</h2>
            <p>
              These Terms govern the use of KasStamp in all forms, including through the public
              website or self-hosted instances. The Service is operated from Hamburg, Germany, and
              subject to the laws of the Federal Republic of Germany and applicable European Union
              law. KasStamp is intended solely as a tool for creating verifiable proofs of existence
              and integrity. It is not a storage service, legal notarization, certification, or
              advisory service. The Service is open-source and provided free of charge. These Terms
              apply regardless of whether you access KasStamp via our hosted instance or self-deploy
              the code.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">4. Nature of the Service</h2>
            <p>
              KasStamp is a browser-based interface that allows users to anchor digital artifacts on
              the Kaspa network. All processing, encryption, and transaction broadcasting occur
              locally within the user’s device. We do not operate backend systems for the Service
              and do not store or transmit user-generated content. We do not intermediate, inspect,
              or control data submitted to the Kaspa network. Any transaction or data publication is
              performed directly by the User and is outside our control. We make no guarantees
              regarding the availability, permanence, or accessibility of any data recorded on the
              Kaspa network. Access depends on third-party nodes and archival operators.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">5. User Obligations and Prohibited Conduct</h2>
            <p>
              Users are solely responsible for ensuring that they have all necessary rights to use,
              anchor, or process any data when using KasStamp and that their actions comply with all
              applicable laws and regulations.
            </p>
            <p className="mt-2">
              It is strictly prohibited to use KasStamp for any unlawful purposes, including but not
              limited to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Uploading, anchoring, linking to, or referencing illegal content, including content
                that violates §§ 86, 130, 184 et seq. of the German Criminal Code (StGB) or other
                applicable laws.
              </li>
              <li>Infringing intellectual property rights or other rights of third parties.</li>
              <li>Engaging in activities that compromise network security or integrity.</li>
              <li>Facilitating or aiding the commission of criminal offenses.</li>
            </ul>
            <p className="mt-2">
              Users must safeguard cryptographic keys and decryption materials. We cannot recover
              lost keys or data. Users are solely responsible for the legality, accuracy, and
              consequences of their use of KasStamp.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">
              6. Responsibility for Content and Safe Harbor
            </h2>
            <p>
              All legal and factual responsibility for content and transactions initiated through
              KasStamp lies solely with the User. We do not host, store, inspect, or control any
              user-generated content and have no technical means to remove or modify content on the
              Kaspa network. We are not obliged to monitor user activity (§ 7(2) TMG / § 8 DDG).
              Obligations to remove or block access under general law remain unaffected once we
              become aware of specific legal violations. If notified by competent authorities of
              unlawful content or activity, we will respond in accordance with our legal obligations
              and within the limits of our capabilities.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">
              7. On-Chain Data, Archival Limitations, and Risk Disclosure
            </h2>
            <p>
              The Kaspa network is a public, decentralized infrastructure. We do not operate or
              control it and cannot prevent the inclusion of data by third parties. Blockchain data
              is immutable. Once recorded, it cannot be altered or removed. Users must exercise
              extreme caution and must not attempt to anchor unlawful or sensitive data. Long-term
              availability of on-chain data depends on archival nodes operated by independent third
              parties, which are beyond our control. We cannot guarantee the continued availability
              or discoverability of data.
            </p>
            <p className="mt-2">
              KasStamp’s long-term vision includes optional domain-specific archival solutions that
              retain only KasStamp-related data, but these are distinct from the Service described
              herein. Use of blockchain technology carries inherent risks, including but not limited
              to: transaction failures, network outages, irreversible actions, third-party node
              failures, potential data loss, and changes in network protocols. Users assume full
              responsibility for these risks.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">
              8. No Storage, Notarization, or Legal Advice
            </h2>
            <p>
              KasStamp is not a storage platform. We do not store user content, and Users must
              retain their own copies of any data they interact with. KasStamp does not provide
              legal notarization, certification, or ownership verification. It is solely a tool for
              generating cryptographic proofs of existence and integrity. Nothing in KasStamp or its
              documentation constitutes legal, financial, or professional advice. Users should
              consult qualified professionals when required.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">9. Intellectual Property and License</h2>
            <p>
              KasStamp is released under the ISC License, a permissive open-source license. Anyone
              may use, copy, modify, and distribute the code under the terms of that license,
              provided that copyright and permission notices are retained. We retain copyright over
              the original software and documentation. We do not warrant the operation or security
              of third-party modifications, forks, or deployments. Such versions are beyond our
              control and responsibility.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">10. Third-Party Services and Links</h2>
            <p>
              KasStamp may reference or link to third-party websites, services, or network nodes. We
              do not control, endorse, or assume responsibility for any third-party content or
              services. Use of any third-party services is at the User’s own risk and subject to the
              terms and policies of those providers.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">11. Indemnification</h2>
            <p>
              Users agree to indemnify, defend, and hold harmless Marcel Sangals and Tjark Fröse,
              and any contributors to KasStamp, from and against all claims, liabilities, damages,
              losses, costs, and expenses (including legal fees) arising from any breach of these
              Terms, any content or data the User anchors to the Kaspa network, any violation of
              applicable law, or any third-party claim relating to the User’s use of the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">
              12. Warranty Disclaimer and Limitation of Liability
            </h2>
            <p>
              KasStamp is provided “as is” and “as available” without warranties of any kind,
              whether express or implied. We make no warranty that the Service will be
              uninterrupted, error-free, secure, or compatible with future versions of the Kaspa
              protocol. Use of KasStamp involves inherent risks, including but not limited to the
              risk of technical malfunctions, network disruptions, software bugs, malicious
              third-party activity, irreversible blockchain transactions, and the potential
              unavailability or disappearance of data anchored to the Kaspa network.
            </p>
            <p className="mt-2">
              KasStamp interacts directly with the Kaspa network through user-controlled wallets.
              Users are solely responsible for the security of their wallets, private keys, seed
              phrases, and any associated funds. We do not have access to, or control over, user
              wallets and cannot recover lost keys, credentials, funds, or assets under any
              circumstances. Any transactions initiated through KasStamp are final and irreversible
              once submitted to the Kaspa network. Users acknowledge and accept the risk of
              permanent financial loss resulting from mistakes in transaction execution, incorrect
              wallet usage, third-party compromise, malicious software, phishing attempts, or
              changes in network behavior.
            </p>
            <p className="mt-2">
              Users further acknowledge that they use KasStamp entirely at their own risk. To the
              fullest extent permitted by law, we disclaim all liability for damages of any kind
              arising from the use of or inability to use the Service, including but not limited to
              data loss, financial loss, loss of assets or funds, loss of profits, reputational
              damage, legal claims, indirect damages, consequential damages, or any other forms of
              loss or harm. Liability for intentional misconduct (“Vorsatz”) and gross negligence
              (“grobe Fahrlässigkeit”), as well as for injury to life, body, or health, remains
              unaffected.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">13. Modifications to the Service and Terms</h2>
            <p>
              We reserve the right to modify, suspend, or discontinue KasStamp at any time without
              prior notice. We may update these Terms periodically. The latest version will always
              be published on our official website. Continued use of KasStamp following such changes
              constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">14. Severability and Entire Agreement</h2>
            <p>
              If any provision of these Terms is held invalid or unenforceable, the remaining
              provisions shall remain in full force and effect. These Terms constitute the entire
              agreement between the parties regarding the use of KasStamp and supersede any prior
              agreements or understandings.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">15. Governing Law and Jurisdiction</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              Federal Republic of Germany, excluding its conflict-of-law rules. The exclusive place
              of jurisdiction for all disputes arising from or in connection with these Terms is
              Hamburg, Germany, provided the User is a merchant, legal entity under public law, or
              special fund under public law.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">16. Contact</h2>
            <p>
              For legal notices or inquiries regarding these Terms, please contact us:
            </p>
            <div className="mt-2">
              <p>Email: kasstamp@gmail.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
