-- 認証済みユーザーが自分のイベントを作成できるポリシー
-- これにより、create-event.tsでService Role権限を使用する必要がなくなる

CREATE POLICY "Users can insert their own events"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

COMMENT ON POLICY "Users can insert their own events" ON public.events IS
'認証済みユーザーが自分のイベント(created_by = auth.uid())を作成できるようにするポリシー';
