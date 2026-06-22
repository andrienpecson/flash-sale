import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Flex,
  Input,
  Layout,
  Statistic,
  Skeleton,
  Typography,
} from 'antd';
import { ShoppingCartOutlined, ThunderboltFilled } from '@ant-design/icons';
import { fetchSaleStatus, purchase, type PurchaseStatus, type SaleStatus } from './api';
import { isValidEmail } from "./utils";

interface StatusView {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

const { Header, Content } = Layout;
const { Title, Text } = Typography;

function describeStatus(status: SaleStatus): StatusView {
  let statusDetails: StatusView = { type: 'info', message: 'The sale is officially live! Go grab yours.' };

  if (status.state === 'ended') {
    statusDetails = { type: 'warning', message: 'This sale has ended.' };
  }

  if (status.soldOut) {
    statusDetails = { type: 'error', message: 'All stock has been claimed.' };
  }

  if (status.state === 'upcoming') {
    statusDetails = { type: 'info', message: 'Sale has not started yet.' };
  }

  if (status.state === 'unavailable') {
    statusDetails = { type: 'info', message: "Sale is not open yet, check back soon." };
  }

  return statusDetails;
}

// Map a purchase outcome to the feedback shown after a Buy Now attempt.
function describePurchase(result: PurchaseStatus): StatusView {
  switch (result) {
    case 'success':
      return { type: 'success', message: '🎉 Congratulation, You secured an item!' };
    case 'already_purchased':
      return { type: 'error', message: "You've already purchased. Limit one per customer." };
    case 'sold_out':
      return { type: 'error', message: 'Sold out — no stock left.' };
    case 'not_active':
      return { type: 'warning', message: "The sale isn't active right now." };
    case 'ended':
      return { type: 'warning', message: 'The sale has ended.' };
  }
}

function App() {
  const [status, setStatus] = useState<SaleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<StatusView | null>(null);

  const getSaleStatus = useCallback(async () => {
    try {
      const saleStatus = await fetchSaleStatus();
      setStatus(saleStatus);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    getSaleStatus();
  }, [getSaleStatus]);

  const handleBuy = useCallback(async () => {
    const trimmed = email.trim();

    if (!isValidEmail(trimmed)) {
      setResult({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setResult(null);
    setSubmitting(true);

    try {
      setResult(describePurchase(await purchase(trimmed)));
      setStatus(await fetchSaleStatus());
      setEmail('');
    } catch (err) {
      setResult({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }, [email]);

  const view = useMemo(() => (status ? describeStatus(status) : null), [status]);
  const canPurchase = status?.state === 'active' && !status.soldOut;
  const emailValid = isValidEmail(email);
  const showEmailError = email.length > 0 && !emailValid;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ThunderboltFilled style={{ color: '#fa541c', fontSize: 20 }} />
        <Text strong style={{ color: '#fff', fontSize: 18 }}>
          Flash Sale
        </Text>
      </Header>

      <Content
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 24,
        }}
      >
        <Card style={{ width: '100%', maxWidth: 480 }}>
          <Flex vertical gap={20}>
            {
              (status?.productName) ?
                <Title level={3} style={{ margin: 0 }}>{status.productName}</Title>
                : <Skeleton.Node active={true} style={{ width: '100%', height: '32px' }} />
            }

            {error ? (
              <Alert type="error" showIcon title="Couldn't load sale status." description={error} />
            ) : (view) &&
            <Alert
              type={view.type ?? 'info'}
              title={view.message}
            />
            }
            <Flex gap={32}>
              <Statistic
                title="Remaining"
                value={status ? status.remainingStock : '—'}
                suffix={status ? `/ ${status.totalStock}` : undefined}
                loading={!status}
              />
              <Statistic
                title="Per user"
                value={1}
                suffix="item"
                loading={!status}
              />
            </Flex>

            <Flex vertical gap={4}>
              {result && <Alert type={result.type} showIcon title={result.message} />}
              <Flex gap={8} style={{ marginTop: 8 }}>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onPressEnter={handleBuy}
                  status={showEmailError ? 'error' : undefined}
                  allowClear
                  disabled={!canPurchase || submitting}
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<ShoppingCartOutlined />}
                  onClick={handleBuy}
                  loading={submitting}
                  disabled={!canPurchase || !emailValid}
                >
                  Buy Now
                </Button>
              </Flex>

              {showEmailError && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  Please enter a valid email address.
                </Text>
              )}
            </Flex>
          </Flex>
        </Card>
      </Content>
    </Layout>
  );
}

export default App;