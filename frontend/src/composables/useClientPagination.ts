import { computed, ref, watch, type Ref } from "vue";

export function useClientPagination<T>(rows: Ref<T[]>, initialPageSize = 20) {
  const page = ref(1);
  const pageSize = ref(initialPageSize);
  const total = computed(() => rows.value.length);
  const pagedRows = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return rows.value.slice(start, start + pageSize.value);
  });

  watch(total, (count) => {
    const lastPage = Math.max(1, Math.ceil(count / pageSize.value));
    if (page.value > lastPage) page.value = lastPage;
  });

  function resetPage() {
    page.value = 1;
  }

  return { page, pageSize, total, pagedRows, resetPage };
}
