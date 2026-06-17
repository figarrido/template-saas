import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components';

export type PasswordResetEmailProps = {
  resetUrl: string;
};

export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your password</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ padding: 24 }}>
          <Heading>Reset your password</Heading>
          <Text>If you did not request this, ignore the email.</Text>
          <Link href={resetUrl}>{resetUrl}</Link>
        </Container>
      </Body>
    </Html>
  );
}
