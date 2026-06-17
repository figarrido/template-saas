import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components';

export type VerifyEmailProps = {
  verifyUrl: string;
};

export function VerifyEmail({ verifyUrl }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email address</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ padding: 24 }}>
          <Heading>Confirm your email</Heading>
          <Text>Click the link below to finish creating your account.</Text>
          <Link href={verifyUrl}>{verifyUrl}</Link>
        </Container>
      </Body>
    </Html>
  );
}
