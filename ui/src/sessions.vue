<template>
<div>
    <h4>AcquisitionDate / Session Mappings</h4>
    <p>Decide how want to map DICOM AcquisitionDate to BIDS Session IDs. You can leave it blank if it's single session. You can download the mapping table later.</p>
    <!--series ID-->
    <el-dropdown @command="resetSessions" style="float: right;" size="small">
        <el-button type="primary" size="small">
            Reset Mapping <i class="el-icon-arrow-down el-icon--right"></i>
        </el-button>
        <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="empty">Leave them empty</el-dropdown-item>
            <el-dropdown-item command="date">Use AcquisitionDates</el-dropdown-item>
            <el-dropdown-item command="num">Numerical (1,2,3..)</el-dropdown-item>
            <el-dropdown-item command="same">Set all to the same ID ...</el-dropdown-item>
        </el-dropdown-menu>
    </el-dropdown>
    <el-table :data="$root.sessions" style="width: 100%" size="mini">
        <el-table-column label="DICOM AcquisitionDate" width="300px">
            <template slot-scope="scope">
                <i class="el-icon-right" style="float: right; font-size: 150%; font-weight: bold;"/>
                {{scope.row.AcquisitionDate}}
            </template>
        </el-table-column>
        <el-table-column label="BIDS Session ID">
            <template slot-scope="scope">
                <el-input v-model="scope.row.ses" placeholder="no session" size="small">
                    <template slot="prepend">ses-</template>
                </el-input>
            </template>
        </el-table-column>
    </el-table>
</div>
</template>

<script>

export default {
    data() {
        return {
            //subjects: [] 
        }
    },

    watch: {
        '$root.sessions'(v, ov) {
            console.log("session updated (analyzer finished?).. initializing keys");
            if(v.length == 0) return; //prevent infinite loop
            if(ov.length == 0) {
                this.resetSessions('empty');
            }
        },
    },

    created() {
    },

    methods: {
        resetSessions(command) {
            console.log("reset session");
            let num = 1;
            let id;
            switch(command) {
            case "empty":
                this.$root.sessions.forEach(session=>{
                    session.ses = "";
                });
                break;
            case "date":
                this.$root.sessions.forEach(session=>{
                    session.ses = session.AcquisitionDate;
                });
                break;
            case "num":
                this.$root.sessions.forEach(session=>{
                    session.ses = num.toString();
                    num++;
                });
                break;
            case "same":
                id = prompt("Please enter session ID to set");
                this.$root.sessions.forEach(session=>{
                    session.ses = id;
                    num++;
                });
                break;
            }        
        }
    },
}
</script>

<style scoped>
</style>
