<!-- src/components/DataTable/SimpleTable.vue -->
<template>
    <div class="table-wrapper">
        <table class="data-table">
            <thead>
                <tr>
                    <th v-for="col in columns" :key="col.key">{{ col.title }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, index) in data" :key="index">
                    <td v-for="col in columns" :key="col.key">{{ row[col.key] }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    columns: { title: string; key: string }[];
    data: Record<string, any>[];
}>();
</script>

<style scoped>
.table-wrapper {
    height: 100%;
    overflow: hidden;
    color: #fff;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.data-table th {
    background: rgba(255, 255, 255, 0.1);
    color: #00d8ff;
    padding: 10px;
    text-align: left;
}

.data-table td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.data-table tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
}
</style>