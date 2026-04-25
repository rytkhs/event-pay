import { ContactForm } from "./ContactForm";

export const dynamic = "force-static";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-muted/30 px-0 py-6 sm:p-6">
      <div className="container mx-auto w-full max-w-2xl space-y-6 px-4 sm:space-y-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-4xl">お問い合わせ</h1>
          <p className="text-xs text-muted-foreground sm:text-base">
            みんなの集金に関するご質問・ご意見をお寄せください
          </p>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
